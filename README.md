# Connect PostgREST Session

If you use PostgREST to talk to your database and you need session store, this is the module for you.

Used https://github.com/voxpelli/node-connect-pg-simple as a template for this, 

A simple, minimal PostgREST session store for Express/Connect

## Installation

```bash
npm install connect-postgrest-session
```

Once npm installed the module, you need to create the **session** table in your database. For that you can use the [table.sql] (https://github.com/ekristen/connect-postgrest-session/blob/master/table.sql) file provided with the module: 

```bash
psql mydatabase < node_modules/connect-postgrest-session/table.sql
```

Or simply play the file via a GUI, like the pgAdminIII queries tool.

## Usage

Examples are based on Express 4.

Simple example:

```javascript
var session = require('express-session');

var SessionPostgrestStore = require('connect-postgrest-session')(session)

var sessionStore = new SessionPostgrestStore({
  baseUrl: config.postgrest.baseUrl
})

app.use(session({
  store: sessionStore,
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

Advanced example showing some custom options:

```javascript
var pg = require('pg')
var session = require('express-session')

var SessionPostgrestStore = require('connect-postgrest-session')(session)

app.use(session({
  store: new SessionPostgrestStore({
    baseUrl: config.postgrest.baseUrl,
    headers: {
      'Authorization: 'Bearer TOKEN'
    }
  })
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

Express 3 (and similar for Connect):

```javascript
var express = require('express');

var SessionPostgrestStore = require('connect-postgrest-session')(session)

var sessionStore = new SessionPostgrestStore({
  baseUrl: config.postgrest.baseUrl
})

app.use(session({
  store: sessionStore,
  secret: process.env.FOO_COOKIE_SECRET,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```
