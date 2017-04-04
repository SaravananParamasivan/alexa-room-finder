
/**
 * @file Tests the lambda code, using the lambda-local package. To be run with node from the terminal.
 * You may need to install lambda-local, using 'npm install lambda-local'. If you do a global install (i.e. 'sudo npm install -g lambda-local') you can also test the lambda code using the console.
 *
 * NB: test-config.js must first be edited to contain a token for this code to work. Otherwise it will return a JSON parsing error.
 */

const lambdaLocal = require('lambda-local');

const config = require('../test-config'); // config.js contains the token.

// This is the JSON payload to send to Lambda.
// This one is sent when the user first agrees to book.
const jsonPayload = {
  "session": {
    "sessionId": "",
    "application": {
      "applicationId": config.appId, // App ID
    },
    "attributes": {
      "speechOutput": "Would you like to book a meeting room at the Turing?", // Last speech output
      "STATE": "", // Current state
      "repromptSpeech": "I'm Room Finder. My job is to book meeting rooms! If you need further instructions, just ask me for help.", //Last reprompt speech
    },
    "user": {
      "userId": "",
      "accessToken": config.token, // Microsoft Authentication Token
    },
    "new": false, // New session
  },
  "request": {
    "type": "IntentRequest", // Type of Request
    "requestId": "",
    "locale": "en-GB", // Locale
    "timestamp": "",
    "intent": {
      "name": "BookIntent", // Name of Intent
      "slots": {},
    },
  },
  "version": "1.0",
};

// Main
lambdaLocal.execute({
  event: jsonPayload,
  lambdaPath: '../lambda/index.js',
  profileName: 'default',
  timeoutMs: 3000,
});
