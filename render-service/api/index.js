'use strict';

const express = require('express');
const app = express();
const port = 3000;

const { sessionExists } = require('../lib/session');
const { fetchChunks } = require('../lib/fetch-and-concat');
const { log, logError } = require('../lib/logger');

app.post('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  log('sessionId', sessionId);
  if (!sessionId.match(/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89aAbB][a-f0-9]{3}-[a-f0-9]{12}/)) {
    logError('Invalid session id', sessionId);
    res.status(400).send('Invalid session id');
  } else {
    sessionExists(sessionId)
      .then(() => {
        log('Start prosessing', sessionId);
        fetchChunks(sessionId);
        return res.send(`Start prosessing ${sessionId}`);
      })
      .catch(() => {
        logError('Invalid session id, session not found', sessionId);
        return res.status(400).send('Invalid session id, session not found');
      });
  }
});

app.listen(port, function () {
  log(`port ${port}`);
});
