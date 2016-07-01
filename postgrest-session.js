'use strict'

var debug = require('debug')('connect-postgrest-session')
var util = require('util')

module.exports = function (session) {
  var Store = session.Store || session.session.Store

  function PostgrestSessionStore (options) {
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
  util.inherits(PostgrestSessionStore, Store)

  PostgrestSessionStore.prototype.close = function () {
    var self = this
    self.closed = true

    if (this.pruneTimer) {
      clearTimeout(self.pruneTimer)
      self.pruneTimer = undefined
    }
  }

  PostgrestSessionStore.prototype.pruneSessions = function (callback) {
    var self = this

    if (typeof callback !== 'function') {
      callback = function noop () {}
    }

    var epoch = Math.floor(new Date().getTime() / 1000)

    self.postgrest.delete({
      url: '/sessions?expire=lt.' + epoch
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

  PostgrestSessionStore.prototype.getExpireTime = function (maxAge) {
    var ttl = this.ttl

    ttl = ttl || (typeof maxAge === 'number' ? maxAge / 1000 : 86400)
    ttl = Math.ceil(ttl + Date.now() / 1000)

    return ttl
  }

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
        debug('get - success - data: %j', data)
        return callback(null, data.sess)
      } catch (e) {
        debug('get try callback error: %j', e)
        return self.destroy(sid, callback)
      }
    })
  }

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
        return self.postgrest.post({
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
          return callback()
        })
      }

      debug('set update data: %j', {sess: sess, expire: expireTime, sid: sid})
      self.postgrest.patch({
        url: '/sessions?sid=eq.' + sid,
        body: {
          sess: sess,
          expire: expireTime
        }
      }, function (err, res, data) {
        if (err) {
          debug('set update error: %j', err)
          return callback(err)
        }

        debug('set update success')
        return callback()
      })
    })
  }

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
      return callback()
    })
  }

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
      return callback()
    })
  }

  return PostgrestSessionStore
}
