/**
 * This sample shows how to connect a Box webhook to a Lambda function via API Gateway.
 *
 * For step-by-step instructions on how to create a Box application and a webhook,
 * see https://github.com/box/samples/tree/master/box-node-webhook-to-lambda-sample
 */

'use strict';
const nodemailer = require('nodemailer');
const BoxSDK = require('box-node-sdk');
const jsonConfig = {
    boxAppSettings: {
        clientID: process.env.BOX_CLIENT_ID,
        clientSecret: process.env.BOX_CLIENT_SECRET,
    },
    enterpriseID: process.env.BOX_ENTERPRISE_ID,
};
BoxSDK.getPreconfiguredInstance(jsonConfig);
const client = BoxSDK.getPreconfiguredInstance(jsonConfig).getAnonymousClient();

const transport = nodemailer.createTransport({
    host: process.env.mailer_host,
    port: 587,
    auth: {
        user: process.env.mailer_username,
        pass: process.env.mailer_password
    },
});

const getMetadata = async (fileId) => {
    try {
        const res = await client.files.getMetadata(fileId, "enterprise", "eventSubmissionDocument");
        return res;
    } catch (err) {
        console.log(`Error getting metadata: ${JSON.stringify(err)}`);
        return null;
    }
};


/**
 * The event handler validates the message using the signing keys to ensure that the message
 * was sent from your Box application before calling handleWebhookEvent().
 */
module.exports.handler = async (event, context, callback) => {

    if (BoxSDK.validateWebhookMessage(event.body, event.headers)) {
        const response = { statusCode: 403, body: 'Message authenticity not verified' };
        console.log(`Response: ${JSON.stringify(response, null, 2)}`);
        callback(null, response);
        return;
    }

    if (!event.body) {
        const response = { statusCode: 403, body: 'Missing event body' };
        console.log(`Response: ${JSON.stringify(response, null, 2)}`);
        callback(null, response);
        return;
    }

    // Parse the message body from the Lambda proxy
    const body = JSON.parse(event.body);
    const fileId = body.source.item.id;
    const action = body.source.status; 

    console.log(`Processing Task Completion for File ID: ${fileId} and status ${action}`);
    await getMetadata(fileId).then(metadata => { 
        if (!metadata) {
            console.log(`No metadata found for file id ${fileId}`);
            callback(null, { statusCode: 200, body: 'no metadata found' });
            return;
        }
        const patchs = [
            { op: 'replace',
              path: '/submissionStatus',
              value: (action === 'APPROVED' ? 'Approved' : 'Waiting for Revision')
            }
        ];
        client.files.updateMetadata(fileId, "enterprise", "eventSubmissionDocument", patchs).then(newdata => {
            //const data = {};
            //const emailToSend = nodemailing.render("static/notification.html", data);
            const message = {
                from: "noreply@koeppster.net",
                to: process.env.mailer_sendto,
                subject: "Event Submission Status Update",
                text: `The Park Service has a message for you. To view status of your submitted document, please visit https://ubuntu-mini:3001/portal`,
                html: `<div>
                            <h1>The Park Service has a message for you</h1>
                            <A href='https://ubuntu-mini:3001/portal'>To View status of your subitted document</a>
                        </div>`
            };

            transport.sendMail(message)
                .then(info => {
                    console.log(`Email sent: ${JSON.stringify(info.response, null, 2)}`);
                })
                .catch(err => {
                    console.log(`Error sending email: ${err}`);
                });
            callback(null, {statusCode: 200, body: 'metadata updated'});
        }).catch(err => {
            console.log(`Error updating metadata: ${err}`);
            callback(null, {statusCode: 400, body: 'error updating metadata'});
        });
    });
    console.log("Processing Complete");
};