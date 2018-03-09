var POLL_DURATION = parseInt(process.env.POLL_DURATION);
var WAIT_DURATION = parseInt(process.env.WAIT_DURATION);

var FOLDER_NAME =  process.env.BACKUP_FOLDER;
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
var WARNING = 'Warning';

var S3FS = require('s3fs');
var fsImpl = new S3FS(S3_BUCKET, {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: 'ap-south-1'
});

var pg = require('pg');
var DATABASE_URL = process.env.DATABASE_URL;

var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD
    }
});

var EMAIL_TO_ADDRESS = process.env.EMAIL_TO_ADDRESS;


function log(level, phrase) {
    var date = new Date();
    console.log(level, date.toISOString(), phrase);
    var logStream = fs.createWriteStream('log.txt', {'flags': 'a'});
    logStream.end(level + '\t' + date.toISOString() + '\t' + phrase + '\n');

    if (level === ERROR) {
        sendErrorEmail(phrase);
    }
}

function sendErrorEmail(err) {
    var mailOptions = {
        from: 'Backup Service <' + process.env.GMAIL_USER + '>', // sender address
        to: EMAIL_TO_ADDRESS, // list of receivers
        subject: 'Backup - Error', // Subject line
        text: 'An error occured in backup: ' + err, // plaintext body
    };

    sendEmail(mailOptions);
}

function sendSuccessEmail(err) {
    var mailOptions = {
        from: 'Backup Service <' + process.env.GMAIL_USER + '>', // sender address
        to: EMAIL_TO_ADDRESS, // list of receivers
        subject: 'Backup - Success', // Subject line
        text: 'The backup of ' + FOLDER_NAME + ' was successful', // plaintext body
    };

    sendEmail(mailOptions);
}

function sendEmail(mailOptions) {
    transporter.sendMail(mailOptions, function(error, info){
        if(error) {
            return log(WARNING, error);
        }

        log(INFO, 'Email Message sent: ' + info.response);
    });
}

function ftpFile(callback) {
    var c = new FTPClient();

    log(INFO, 'Connecting to FTP location');

    c.on('ready', function() {
        log(INFO, 'Connected to FTP location');
        
        downloadFolder(c, FOLDER_NAME, function(err) {
            if (err) {
                log(ERROR, err);
                callback();
            } else {
                log(INFO, 'Finished downloading ' + FOLDER_NAME);
                c.end();
                callback();
            }
        });
    });

    c.on('error', function(err) {
        log(ERROR, 'Connection error ' + err);
        callback();
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
                        //if (element.name !== '.' && element.name !== '..' && element.name.indexOf('pic_gallery') == -1) {
                        if (element.name !== '.' && element.name !== '..') {
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

function logRun(callback) {
    log(INFO, 'Inserting run data');
    pg.connect(DATABASE_URL, function(err, client, done) {
        if (err) {
            log(ERROR, 'Cannot connect to database ' + db);
            done();
            callback(err);
        } else {
            client.query('INSERT INTO lastrun (date) VALUES ($1)', [new Date()], function(err, result) {
                if (err) {
                    log(ERROR, 'Cannot connect to database ' + db);
                    done();
                    callback(err);
                } else {
                    log(INFO, 'Inserted run data');
                    done();
                    callback(null);
                }       
            });
        }
    });
}

function checkLastRun(callback) {
    log(INFO, 'Checking last run data');

    pg.connect(DATABASE_URL, function(err, client, done) {
        if (err) {
            log(ERROR, 'Cannot connect to database ' + err);
            done();
            callback(err, null);
        } else {
            client.query('SELECT date FROM lastrun ORDER BY date DESC', function(err, result) {
                if (err) {
                    log(ERROR, 'Cannot connect to database ' + err);
                    done();
                    callback(err, null);
                } else {
                    done();
                    callback(null, result);
                }       
            });
        }
    });
}

function logAndStartRun() {
    logRun(function(err) {
        if (err) {
            log(ERROR, 'Cannot insert row ' + err);
            return;
        } else {
            log(INFO, 'Starting worker');
            ftpFile(function() {
                sendSuccessEmail();
                poll();
            });
            //poll();
        }
    });
}

function runTask() {
    log(INFO, 'Running Task');
    checkLastRun(function(err, result) {
        if (err) {
            // Fail after logging
            log(ERROR, 'Error quering row ' + err);
            poll();
            return;
        } else {
            if (result.rowCount > 0) {
                var d = result.rows[0].date;
                log(INFO, 'Last run was at ' + d);

                var dateDifference = (new Date()) - d;
                if (dateDifference > WAIT_DURATION) {
                    log(INFO, 'Time difference was met starting run');
                    logAndStartRun();
                } else {
                    log(INFO, 'Time difference was not met waiting');
                    poll();
                }
            } else { 
                logAndStartRun();
            }
        }
    });   
}

function poll() {
    log(INFO, 'Waiting for ' + POLL_DURATION);
    setTimeout(runTask, POLL_DURATION);
}

runTask();
