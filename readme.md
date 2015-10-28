# Node FTP backup tool

This tool is a worker job that can be deployed on Heroku that first fetches data from an FTP location and then backs it up to a S3 bucket. 

The job writes the last run time in the local Heroku postgres database and then keeps polling using setTimeout. After the "WAIT_DURATION" it starts the backup routine.

The job also sends an email once it runs successfully. In addition it also sends the error message in the email in case it fails.

It needs a the following environment variables in order to operate

 * FTP_HOST - The host name for the FTP location
 * FTP_USER_NAME - The user name for the FTP location
 * FTP_PASSWORD - The password for the FTP location
 * S3_BUCKET - The S3 bucket name to write to
 * S3_ACCESS_KEY_ID - The AWS access key id (from the AWS console)
 * S3_SECRET_ACCESS_KEY - The AWS secret access key (from the AWS console)
 * DATABASE_URL - The local postgres database URL. This is used as a store to store the last run information
 * GMAIL_USER - The username of the Gmail user - this is used to send a confirmation email
 * GMAIL_PASSWORD - The password of the Gmail user - this is used to send a confirmation email
 * EMAIL_TO_ADDRESS - This is the address or list of addresses to which the email should be sent. This includes both error and success emails.
 * POLL_DURATION - The duration after which it should poll. The job has a set tiemout which waits for a certain duration
 * WAIT_DURATION - The duration to wait for.
 * BACKUP_FOLDER - This is the folder name on the FTP location which needs to  be backed-up

In order to run the server use the following command

```bash
node index.js
```