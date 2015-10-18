var DURATION = 24 * 60 * 1000;
var FOLDER_NAME =  'public_html';
var DOWNLOAD_DEST = './downloads'

var USERNAME = process.env.FTP_USER_NAME;
var PASSWORD = process.env.FTP_PASSWORD;
var HOST = process.env.FTP_HOST;

var S3_BUCKET = process.env.S3_BUCKET;
var S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
var S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

var FTPClient = require('ftp');
var fs = require('fs');

var INFO = 'Info';
var ERROR = 'Error';

var S3FS = require('s3fs');
var fsImpl = new S3FS(S3_BUCKET, {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY
});


function log(level, phrase) {
    var date = new Date();
    console.log(level, date.toISOString(), phrase);
    var logStream = fs.createWriteStream('log.txt', {'flags': 'a'});
    logStream.end(level + '\t' + date.toISOString() + '\t' + phrase + '\n');
}

function ftpFile(callback) {
    var c = new FTPClient();

    log(INFO, 'Connecting to FTP location');

    c.on('ready', function() {
        log(INFO, 'Connected to FTP location');
        
        downloadFolder(c, FOLDER_NAME, function(err) {
            if (err) {
                log(ERROR, err);
            } else {
                log(INFO, 'Finished downloading' + FOLDER_NAME);
                c.end();
                callback();
            }
        });
    });

    c.on('error', function(err) {
        log(ERROR, err);
    });

    c.connect({
        user: USERNAME,
        password: PASSWORD,
        host: HOST
    });
}

function createFolder(path, callback) {
    fsImpl.exists(path, function(exists) {
        if (!exists) {
            fsImpl.mkdir(path, function() {
                callback();
            });    
        }
    });
}

function downloadFolder(conn, folder, callback) {

    log(INFO, 'Downloading folder ' + folder);
    
    var fullPath = DOWNLOAD_DEST + '/' + folder;

    createFolder(fullPath, function() {
        var subFolders = [];
        var filesToDownload = [];

        conn.list(folder, function(err, list) {
            if (err) {
                callback(err);
                return;
            } else {
                list.forEach(function(element, index) {
                    if (element.type === 'd') {
                        if (element.name !== '.' && element.name !== '..' && element.name.indexOf('pic_gallery') == -1) {
                            subFolders.push(element.name);
                        }
                    } else {
                        filesToDownload.push(element.name);
                    }
                });

                dowloadAllFiles(0, function(err) {
                    if (err) {
                        callback(err);
                        return;
                    } else {
                        downloadSubFolders(0);
                    }
                });

                function dowloadAllFiles(index, callback) {
                    if (index >= filesToDownload.length) {
                        callback();
                        return;
                    } else {

                        var fileFullPath = fullPath + '/' + filesToDownload[index];
                        log(INFO, 'Downloading file ' + fileFullPath);

                        conn.get(folder + '/' + filesToDownload[index], function(err, stream) {
                            if (err) {
                                callback(err);
                                return;
                            } else {
                                stream.once('close', function() {
                                    log(INFO, 'Downloaded ' + fileFullPath);
                                    dowloadAllFiles(index + 1, callback);
                                });
                                stream.pipe(fsImpl.createWriteStream(fileFullPath));
                            }
                        });
                    }                
                }

                function downloadSubFolders(index) {

                    if (index >= subFolders.length) {
                        log(INFO, 'Downloaded folder ' + folder);
                        callback();
                        return;
                    } else {
                        downloadFolder(conn, folder + '/' + subFolders[index], function(err) {
                            if (err) {
                                callback(err);
                                return;
                            } else {
                                downloadSubFolders(index + 1);
                            }
                        });
                    }    
                }   
            }
        });
    });
        
}

function runTask() {
    log(INFO, 'Running Task');
    ftpFile(function() {
        startWorker();
    }); 
}

function startWorker() {
    log(INFO, 'Waiting for ' + DURATION);
    setTimeout(runTask, DURATION);
}

runTask();
