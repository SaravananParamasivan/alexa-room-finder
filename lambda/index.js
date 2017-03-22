/**
 * @file Main Alexa Skill handling code. Ensure handler is index.handler (which is default)
 * in order to call this as the opening of the file. Must be zipped with requesters.js, and
 * appropriate node_modules in order to work.
 * @summary Handles Alexa skill.
 */

'use strict';

const Alexa = require('alexa-sdk');
const moment = require('moment');
const Q = require('q');
const requesters = require('./requesters')
const config = require('./config');
const resources = require('./resources');

//Object of all states to be used by the code.
const states = {
  CONFIRMMODE: '_CONFIRMMODE', // Initiated by BookIntent, when user asks to book, and an available room is found.
  TIMEMODE: '_TIMEMODE'
};


/**
 * The set of handlers used for when a new session is inititated.
 */
const sessionHandlers = {
  //Called when skill is opened without being asked to book a room.
  'LaunchRequest': function() {
    emitAsk.call(this,
      this.t('WELCOME_MESSAGE', this.t('BUSINESS_NAME')),
      this.t('WELCOME_REPROMPT', this.t('SKILL_NAME')));
  },
  //Gives a help message
  'AMAZON.HelpIntent': function () {
    emitAsk.call(this,
      this.t('HELP_MESSAGE'),
      this.t('HELP_REPROMPT'));
  },
  //Repeats last messages
  'AMAZON.RepeatIntent': function () {
    emitRepeat.call(this);
  },
  //Stop, cancel, and no, all end session. Can be individually edited for more complex conversations.
  'AMAZON.StopIntent': function () {
    this.emit('SessionEndedRequest');
  },
  'AMAZON.CancelIntent': function () {
    this.emit('SessionEndedRequest');
  },
  'AMAZON.NoIntent': function() {
    this.emit('SessionEndedRequest');
  },
  //Yes calls booking function
  'AMAZON.YesIntent': function() {
    this.emit('BookIntent');
  },
  //Does the key booking function. This is intended to work from a LaunchRequest - i.e. "Ask Room Finder to book me a room."
  'BookIntent': function() {

    this.handler.state = states.TIMEMODE;

    emitAsk.call(this,
      this.t('TIME_DURATION_MESSAGE'),
      this.t('TIME_DURATION_REPROMPT')
    );
  },
  //Only called when an unhandled intent is sent, which should never happen in the code at present, as there is only one custom intent, so this's effectively always used.
  'Unhandled': function() {
    emitAsk.call(this,
      this.t('UNHANDLED_MESSAGE'),
      this.t('UNHANDLED_REPROMPT')
    );
  },
  //Called from all state handlers when the session ends without a booking being made. Also called in general session.
  'SessionEndedRequest': function () {
    this.emit(':tell', this.t('STOP_MESSAGE'));
  },
};

/**
 * The set of handlers used to ask user how long they want to book the room for.
 *
 * states.TIMEMODE is appeneded to all the Intent names of this string.
 */
const timeModeHandlers = Alexa.CreateStateHandler(states.TIMEMODE, {
  //Gives a different help message
  'AMAZON.HelpIntent': function () {
    emitAsk.call(this,
      this.t('TIME_HELP_MESSAGE', this.attributes.roomName),
      this.t('TIME_HELP_REPROMPT', this.attributes.roomName)
    );
  },
  //Repeats last messages
  'AMAZON.RepeatIntent': function () {
    emitRepeat.call(this);
  },
  //Stop, cancel, and no, all end session. Can be individually edited for more complex conversations.
  'AMAZON.StopIntent': function () {
    this.emit('SessionEndedRequest');
  },
  'AMAZON.CancelIntent': function () {
    this.emit('SessionEndedRequest');
  },
  'AMAZON.NoIntent': function() {
    this.emit('SessionEndedRequest');
  },
  //DurationIntent is used to
  'DurationIntent': function() {

    var bookingDuration = moment.duration(this.event.request.intent.slots.Duration.value);

    if(bookingDuration) {
      if (bookingDuration.asHours() > 2) {
        //Asks again if too long
        emitAsk.call(this,
          this.t('TIME_TOO_LONG_MESSAGE'),
          this.t('TIME_TOO_LONG_REPROMPT')
        );
      } else if (bookingDuration.asHours() <= 0) {
        //Asks again if too short, or not applicable.
        emitAsk.call(this,
          this.t('TIME_UNHANDLED_MESSAGE'),
          this.t('TIME_UNHANDLED_REPROMPT')
        );
      } else {

        setDuration.call(this, bookingDuration);

        getRoom.call(this)
        .then((creds) => {
          if (creds) {
            //Asks for confirmation if room is available
            this.handler.state = states.CONFIRMMODE;

            emitAsk.call(this,
              this.t('ROOM_AVAILABLE_MESSAGE', this.attributes.roomName),
              this.t('ROOM_AVAILABLE_REPROMPT', this.attributes.roomName)
            );
          } else {
            //Asks again if no rooms are available for the specified time.
            emitAsk.call(this,
              this.t('TIME_UNAVAILABLE_MESSAGE', this.attributes.duration),
              this.t('TIME_UNAVAILABLE_REPROMPT', this.attributes.duration)
            );
          }
        }, (error) => {
            this.emit(':tellWithCard',
              this.t('ROOM_ERROR'),
              this.t('ROOM_ERROR_CARD_TITLE'),
              error
            );
            console.error("\n Room Error: " + error);
          });
        }
    } else {
      //Asks again if no/invalid duration is obtained from intent.
      emitAsk.call(this,
        this.t('TIME_UNHANDLED_MESSAGE'),
        this.t('TIME_UNHANDLED_MESSAGE')
      );
    }
  },
  'AMAZON.StartOverIntent':function() {
    emitStartOver.call(this);
  },
  //Only called when an unhandled intent is sent, which should never happen in the code at present, as there is only one custom intent, so this's effectively always used.
  'Unhandled': function() {
    emitAsk.call(this,
      this.t('TIME_UNHANDLED_MESSAGE'),
      this.t('TIME_UNHANDLED_REPROMPT')
    );
  }
});



/**
 * Set of handlers used to confirm a booking.
 */
const confirmModeHandlers = Alexa.CreateStateHandler(states.CONFIRMMODE, {
  //Gives a different help message
  'AMAZON.HelpIntent': function () {
    emitAsk.call(this,
      this.t('BOOKING_HELP_MESSAGE', this.attributes.roomName),
      this.t('BOOKING_HELP_REPROMPT', this.attributes.roomName)
    );
  },
  //Repeats last messages
  'AMAZON.RepeatIntent': function () {
    emitRepeat.call(this);
  },
  //Stop, cancel, and no, all end session. Can be individually edited for more complex conversations.
  'AMAZON.StopIntent': function () {
    this.emit('SessionEndedRequest');
  },
  'AMAZON.CancelIntent': function () {
    this.emit('SessionEndedRequest');
  },
  'AMAZON.NoIntent': function() {
    this.emit('SessionEndedRequest');
  },
  //'Yes' calls booking finalisation function
  'AMAZON.YesIntent': function() {
    this.emitWithState('BookIntent');
  },
  //BookIntent is used to finalise a booking.
  'BookIntent': function() {

    //Posts room, with error callback spoken through Alexa
    requesters.postRoom(this.event.session.user.accessToken, this.attributes.ownerAddress, this.attributes.ownerName, this.attributes.startTime, this.attributes.endTime)
    .then(() => {
      this.emit(':tellWithCard',
        this.t('ROOM_BOOKED', this.attributes.ownerName, this.attributes.duration),
        this.t('CARD_ROOM_BOOKED_TITLE', this.attributes.ownerName),
        this.t('CARD_ROOM_BOOKED_CONTENT', this.attributes.ownerName, this.attributes.duration)
    );
  }, (bookError) => {
      this.emit(':tellWithCard',
        this.t('BOOKING_ERROR'),
        this.t('BOOKING_ERROR_CARD_TITLE'),
        bookError
      );
      console.error('Posting Error: ' + bookError);
    });
  },
  'AMAZON.StartOverIntent':function() {
    emitStartOver.call(this);
  },
  //Only called when an unhandled intent is sent, which should never happen in the code at present, as there is only one custom intent, so this's effectively always used.
  'Unhandled': function() {
    emitAsk.call(this,
      this.t('BOOKING_UNHANDLED_MESSAGE'),
      this.t('BOOKING_UNHANDLED_REPROMPT')
    );
  }
});

/**
 * emitAsk - takes 2 strings, sets them as attributes for use by repeat, then emits them to ':ask'
 *
 * @param  {string} speechOutput   the initial speech output
 * @param  {string} repromptSpeech the reprompt output
 *
 * NB: Must be bound to the correct this.
 */
function emitAsk(speechOutput, repromptSpeech) {
  this.attributes.speechOutput = speechOutput;
  this.attributes.repromptSpeech = repromptSpeech;
  this.emit(':ask', this.attributes.speechOutput, this.attributes.repromptSpeech);
}

/**
 * resetAttributes - resets all non-state attributes to undefined
 *
 * NB: Must be bound to the correct this
 */
function resetAttributes() {
  this.attributes.ownerAddress = undefined;
  this.attributes.ownerName = undefined;
  this.attributes.roomName = undefined;
  this.attributes.startTime = undefined;
  this.attributes.endTime = undefined;
  this.attributes.duration = undefined;
  this.attributes.speechOutput = undefined;
  this.attributes.repromptSpeech = undefined;
}

/**
 * emitStartOver - resets all states using resetAttributes(), returns state to '', then emits the initial LaunchRequest.
 *
 * NB: Must be bound to the correct this.
 */
function emitStartOver() {
  this.handler.state = '';
  this.handler.response.sessionAttributes['STATE'] = '';

  resetAttributes.call(this);

  this.emitWithState('LaunchRequest');
}

/**
 * emitRepeat - calls emitAsk with the speech attributes set by the previous message
 *
 * NB: Must be bound to the correct this
 */
function emitRepeat() {
  emitAsk.call(this,
    this.attributes.speechOutput,
    this.attributes.repromptSpeech);
}

/**
 * setDuration - sets the startTime, endTime, and duration attributes.
 *
 * @param  {string} bookingDuration ISO duration parsed by moment.js
 *
 * NB: Must be bound to the correct this
 */
function setDuration(bookingDuration) {
  //Define start and end time of period to check
  var startTime = new Date();
  var endTime = new Date(startTime.getTime() + bookingDuration.asMilliseconds());

  //Save dates in attributes as ISO strings, so they can be accessed to post the event later.
  this.attributes.startTime = startTime.toISOString();
  this.attributes.endTime = endTime.toISOString();
  this.attributes.duration = bookingDuration.asMinutes();
}

/**
 * getRoom - uses attributes set by setDuration to get room, and store its credentials in attributes. Also has error handling.
 *
 * @return {promise}  Promise resolved to object. This contains owner, ownerName and ownerAddress if room is available, or is just false if no room is available.
 *
 * NB: Must be bound to correct this
 */
function getRoom() {

  var deferred = Q.defer()

  //Retrieves all of the users calendars, with error callback spoken through Alexa.
  requesters.getCalendars(this.event.session.user.accessToken)
  .then((parsedCals) => {
    //Finds a free room from one of the calendars, with error callback spoken through Alexa.
    requesters.findFreeRoom(this.event.session.user.accessToken, this.attributes.startTime, this.attributes.endTime, config.testNames, parsedCals)
    .then((creds) => {
      //Stores the owner of the room and room name as attributes, for later use when booking room.
      this.attributes.ownerAddress = creds.ownerAddress;
      this.attributes.ownerName = creds.ownerName;
      this.attributes.roomName = creds.name;

      deferred.resolve(creds);
    }, (roomError) => {
      deferred.reject(roomError);
    });
  }, (calError) => {
    deferred.reject(calError);
  });
  return deferred.promise;
}

/**
 * Main
 */
exports.handler = (event, context) => {
  const alexa = Alexa.handler(event, context); //See alexa.js in alexa-sdk package for more information
  alexa.appId = config.appId; //App ID of Alexa skill, found on skill's page.
  alexa.resources = resources.languageStrings; //All strings to be used by program.
  alexa.registerHandlers(sessionHandlers, confirmModeHandlers, timeModeHandlers); //See response.js in alexa-sdk package to see other registered handlers.
  alexa.execute(); //Handles lambda event.
};
