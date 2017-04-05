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
    // .then(() => remove(path.join(sessionDirectory, 'output.h264')))
    .then(() => copyRecordings(sessionId, sessionDirectory))
    .then(() => createIndex(sessionDirectory))
    .then(() => createImageSequence(sessionDirectory))
    .then(() => createGifPreview(sessionDirectory))
    .then(() => remove(path.join(sessionDirectory, 'frames')));
};

const spawnPromise = (spawnProcess) => new Promise((resolve, reject) => {
  spawnProcess.stdout.on('data', (data) => {
    log(`stdout: ${data}`);
  });

  spawnProcess.stderr.on('data', (data) => {
    log(`stderr: ${data}`);
  });

  spawnProcess.on('close', (code) => {
    log(`child process exited with code ${code}`);
    if (code === 0) {
      return resolve();
    }
    return reject(code);
  });
});

const copyRecordings = (sessionId, sessionDirectory) =>
  spawnPromise(spawn('aws',(`s3 sync s3://${process.env.UPLOAD_BUCKET}/${sessionId} ${sessionDirectory}`).split(' ')));

const createIndex = (sessionDirectory) => readDir(sessionDirectory)
  .then((files) =>
    files
      .filter(file => path.extname(file) === '.h264')
      .map((file) =>
        `file ${path.join(sessionDirectory, file)}`)
      .sort())
  .then((files) =>
    writeFile(path.join(sessionDirectory, 'index.txt'), files.join('\n'), 'utf8'));

const createImageSequence = (sessionDirectory) =>
  ensureDir(path.join(sessionDirectory, 'frames'))
    .then(() =>
      spawnPromise(spawn('ffmpeg', (`-f concat -safe 0 -i ${path.join(sessionDirectory, 'index.txt')} -vf scale=320:-1:flags=lanczos,fps=1/4 ${path.join(sessionDirectory, 'frames', 'ffout%06d.png')}`).split(' '))));

const createGifPreview = (sessionDirectory) =>
  spawnPromise(spawn('ffmpeg', (`-i ${path.join(sessionDirectory, 'frames', 'ffout%06d.png')} -vf setpts=4*PTS ${path.join(sessionDirectory, `preview.gif`)}`).split(' ')));

const transcodeChunks = (sessionDirectory) =>
  spawnPromise(spawn('ffmpeg', (`-f concat -safe 0 -i ${path.join(sessionDirectory, 'index.txt')} -c:v libx264 -preset veryfast -crf 28 -c:a copy ${path.join(sessionDirectory, `output-${Date.now()}.mp4`)}`).split(' ')));

// const ffmpeg = spawn('ffmpeg', (`-f concat -safe 0 -i ${path.join(sessionDirectory, 'index.txt')} -c:v libx264 -preset veryfast -crf 28 -c:a copy ${path.join(sessionDirectory, `output-${Date.now()}.mp4`)}`).split(' '));
// const ffmpeg = spawn('ffmpeg', (`-f concat -safe 0 -i ${path.join(sessionDirectory, 'index.txt')} -c:v copy -c:a copy ${path.join(sessionDirectory, 'output.h264')}`).split(' '));

const uploadToS3 = ({sessionId, sessionDirectory}) =>
{
  const Key = `${sessionId}/preview.gif`;
  const Body = fs.readFileSync(path.join(sessionDirectory, 'preview.gif'));
  return s3.upload({
    Bucket: process.env.UPLOAD_BUCKET,
    Key,
    ContentType: 'image/gif',
    Body,
    ContentLength: Body.length,
  });
};

module.exports = {
  fetchChunks,
};
