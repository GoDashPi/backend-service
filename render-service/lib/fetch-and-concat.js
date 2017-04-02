'use strict';

const fs = require('fs-extra');
const BbPromise = require('bluebird');
const spawn = require('child_process').spawn;
const { log } = require('./logger');
const AWS = require('aws-sdk');
const path = require('path');
const config = require('../config.json');

const s3 = new AWS.S3();

const ensureDir = BbPromise.promisify(fs.ensureDir);
const readDir = BbPromise.promisify(fs.readdir);
const writeFile = BbPromise.promisify(fs.writeFile);
const remove = BbPromise.promisify(fs.remove);

const fetchChunks = (sessionId) => {
  const sessionDirectory = path.join(config.recordingsDirectory, sessionId);
  return ensureDir(sessionDirectory)
    .then(() => remove(path.join(sessionDirectory, 'output.h264')))
    .then(() => copyRecordings(sessionId, sessionDirectory))
    .then(() => createIndex(sessionDirectory))
    .then(() => transcodeChunks(sessionDirectory));
};

const copyRecordings = (sessionId, sessionDirectory) => new Promise((resolve, reject) => {
  const aws = spawn('aws', (`s3 sync s3://${process.env.UPLOAD_BUCKET}/${sessionId} ${sessionDirectory}`).split(' '));
  aws.stdout.on('data', (data) => {
    log(`stdout: ${data}`);
  });

  aws.stderr.on('data', (data) => {
    log(`stderr: ${data}`);
    return reject(data);
  });

  aws.on('close', (code) => {
    log(`child process exited with code ${code}`);
    if (code === 0) {
      return resolve();
    }
    return reject(code);
  });
});

const createIndex = (sessionDirectory) => readDir(sessionDirectory)
  .then((files) =>
    files
      .filter(file => path.extname(file) === '.h264')
      .map((file) =>
        `file ${path.join(sessionDirectory, file)}`)
      .sort())
  .then((files) =>
    writeFile(path.join(sessionDirectory, 'index.txt'), files.join('\n'), 'utf8'));

const transcodeChunks = (sessionDirectory) => new Promise((resolve, reject) => {
  // const ffmpeg = spawn('ffmpeg', (`-f concat -safe 0 -i ${path.join(sessionDirectory, 'index.txt')} -c:v libx264 -preset veryslow -crf 28 -c:a copy ${path.join(sessionDirectory, 'output.mp4')}`).split(' '));
  const ffmpeg = spawn('ffmpeg', (`-f concat -safe 0 -i ${path.join(sessionDirectory, 'index.txt')} -c:v copy -c:a copy ${path.join(sessionDirectory, 'output.h264')}`).split(' '));

  ffmpeg.stdout.on('data', (data) => {
    log(`stdout: ${data}`);
  });

  ffmpeg.stderr.on('data', (data) => {
    log(`stderr: ${data}`);
    return reject(data);
  });

  ffmpeg.on('close', (code) => {
    log(`child process exited with code ${code}`);
    if (code === 0) {
      return resolve();
    }
    return reject(code);
  });
});

const uploadToS3 = (sessionDirectory) =>
  s3.putObject({
    Bucket: process.env.UPLOAD_BUCKET,
    Key: 'output.h264',
    ContentType: 'video/h264',
    Body: fs.readFileSync(path.join(sessionDirectory, 'output.h264'))
  });

module.exports = {
  fetchChunks,
};
