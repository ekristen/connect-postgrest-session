'use strict'

var debug = require('debug')('connect-postgrest-session')

var util = require('util')

module.exports = function (session) {
  var Store = session.Store || session.session.Store

  var PostgrestSessionStore = function (options) {
    options = options || {}
    Store.call(this, options)

    debug('options: %j', options)

    this.postgrest = require('request').defaults({
      json: true,
      baseUrl: options.baseUrl || 'http://localhost:6000',
      headers: options.headers || {}
    })

    if (options.pruneSessionInterval === false) {
      this.pruneSessionInterval = false
    } else {
      this.pruneSessionInterval = (options.pruneSessionInterval || 60) * 1000
      setImmediate(function () {
        this.pruneSessions()
      }.bind(this))
    }
  }

  /**
   * Inherit from `Store`.
   */
  util.inherits(PostgrestSessionStore, Store)

  /**
   * Closes the session store
   *
   * Currently only stops the automatic pruning, if any, from continuing
   *
   * @access public
   */
  PostgrestSessionStore.prototype.close = function () {
    var self = this
    self.closed = true

    if (this.pruneTimer) {
      clearTimeout(self.pruneTimer)
      self.pruneTimer = undefined
    }

    if (self.ownsPg) {
      self.pg.end()
    }
  }

  /**
   * Does garbage collection for expired session in the database
   *
   * @param {Function} [fn] - standard Node.js callback called on completion
   * @access public
   */
  PostgrestSessionStore.prototype.pruneSessions = function (callback) {
    var self = this

    if (typeof callback !== 'function') {
      callback = function noop () {}
    }

    self.postgrest.delete({
      url: '/sessions?expire=lt.NOW()'
    }, function (err, res, body) {
      if (err) {
        debug('error: %j', err)
        return callback(err)
      }

      if (self.pruneSessionInterval && !self.closed) {
        if (self.pruneTimer) {
          clearTimeout(self.pruneTimer)
        }
        self.pruneTimer = setTimeout(self.pruneSessions.bind(self, true), self.pruneSessionInterval)
      }

      callback()
    })
  }

  /**
   * Figure out when a session should expire
   *
   * @param {Number} [maxAge] - the maximum age of the session cookie
   * @return {Number} the unix timestamp, in seconds
   * @access private
   */
  PostgrestSessionStore.prototype.getExpireTime = function (maxAge) {
    var ttl = this.ttl

    ttl = ttl || (typeof maxAge === 'number' ? maxAge / 1000 : 86400)
    ttl = Math.ceil(ttl + Date.now() / 1000)

    return ttl
  }

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid – the session id
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */
  PostgrestSessionStore.prototype.get = function (sid, callback) {
    var self = this

    var epoch = Math.floor(new Date().getTime() / 1000)
    var url = '/sessions?sid=eq.' + sid + '&expire=gte.' + epoch

    debug('get - sid: %s, url: %s', sid, url)

    self.postgrest.get({
      url: url,
      headers: {
        Prefer: 'plurality=singular'
      }
    }, function (err, res, data) {
      if (err) {
        debug('get error: %j', err)
        return callback(err)
      }

      if (!data) {
        debug('get - no data found - data: %j', data)
        return callback()
      }

      try {
        return callback(null, data.sess)
      } catch (e) {
        debug('get try callback error: %j', e)
        return self.destroy(sid, callback)
      }
    })
  }

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid – the session id
   * @param {Object} sess – the session object to store
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */
  PostgrestSessionStore.prototype.set = function (sid, sess, callback) {
    var self = this
    var expireTime = this.getExpireTime(sess.cookie.maxAge)

    debug('set - sid: %s', sid)

    self.postgrest.get('/sessions?sid=eq.' + sid, function (err, res, data) {
      if (err) {
        debug('set get error: %j', err)
        return callback(err)
      }

      if (data.length === 0) {
        // created
        self.postgrest.post({
          url: '/sessions',
          body: {
            sess: sess,
            expire: expireTime,
            sid: sid
          }
        }, function (err, res, data) {
          if (err) {
            debug('set create error: %j', err)
            return callback(err)
          }

          debug('set create success')
          callback()
        })
      } else if (data.length > 0) {
        self.postgrest.patch({
          url: '/sessions?sid=eq.' + sid,
          body: {
            sess: sess,
            expire: expireTime,
            sid: sid
          }
        }, function (err, res, data) {
          if (err) {
            debug('set update error: %j', err)
            return callback(err)
          }

          debug('set update success')
          callback()
        })
      } else {
        debug('if you see this, this is bad :)')
        callback()
      }
    })
  }

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid – the session id
   * @access public
   */
  PostgrestSessionStore.prototype.destroy = function (sid, callback) {
    var self = this

    if (typeof callback !== 'function') {
      callback = function noop () {}
    }

    var options = {
      url: '/sessions?sid=eq.' + sid
    }

    debug('destroy - sid: %s, options: %j', sid, options)

    self.postgrest.delete(options, function (err, res, data) {
      if (err) {
        debug('session delete error: %j', err)
        return callback(err)
      }

      debug('session delete success')
      callback()
    })
  }

  /**
   * Touch the given session object associated with the given session ID.
   *
   * @param {String} sid – the session id
   * @param {Object} sess – the session object to store
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */
  PostgrestSessionStore.prototype.touch = function (sid, sess, callback) {
    var self = this
    var expireTime = this.getExpireTime(sess.cookie.maxAge)

    var options = {
      url: '/sessions?sid=eq.' + sid,
      body: {
        expire: expireTime
      }
    }

    debug('touch - sid: %s, options: %j', sid, options)

    self.postgrest.patch(options, function (err, res, data) {
      if (err) {
        debug('session touch error: %j', err)
        return callback(err)
      }

      debug('session touch success')
      callback()
    })
  }

  return PostgrestSessionStore
}
