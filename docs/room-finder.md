# Room Finder Maintenance Documentation [Draft 1.1]

This is intended to explain how the code behind my Room Finder skill works, for maintenance purposes.

I'd like to think it's already a bit better commented and documented than the SDK, but it's a lot simpler too.

# The Alexa SDK API

This brief section is intended to help you use the [alexa-sdk](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs) Node Package without understanding exactly what's up under the hood. First, do check out Amazon's basic [alexa-sdk documentation](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs/README.md). You will also likely need the context of the overall [Alexa Skills Kit documentation](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/getting-started-guide). If you want to know how the SDK works under the hood check out [docs/alexa-sdk](./alexa-sdk).

To just summarize their documentation, the Alexa SDK works on an 'listener' system, where it sets up a handler - which is basically just a Node [EventEmitter](https://nodejs.org/api/events.html) - that listens for particular events, then 'emits' other events in response. You set up the intents to listen for, and what to send back. The EventEmitter also has a preregistered set of listeners (`':tell'`, `':ask'`, `':askWithCard'`, `':tellWithCard'`, `':tellWithLinkAccountCard'`, `':askWithLinkAccountCard'`, `':responseReady'`, `':saveState'`, and `':saveStateError'`), which will push the parameters you send them to Alexa, and sort the rest of the response object for you. This whole process will only work in AWS Lambda.

Now some details that I think are poorly covered by documentation.

#### Can I emit between different handlers and state handlers?

Yes, you very much can. All the handlers are actually registered together in one big [EventEmitter](https://nodejs.org/api/events.html), known from here on out as `handler`; to allow this without overlapping intent names, intents with states are actually listening for `IntentName_STATEAPPENDED`.

When Lambda gets an intent from the Echo, the SDK just appends the state on to the intent before emitting it to the handler. The issue this means that if you write `this.emit('BookIntent')` within any of the state handlers, it will always just call the 'BookIntent' of the 'stateless' handlers. Therefore if you want to call the 'BookIntent' in \_CONFIRMMODE, you have to use `this.emitWithState('BookIntent')` with the correct `this.handler.state` set.

#### So how does emitWithState work?

Very simply, it concatenates `this.handler.state` onto the intent parameter, does a bit of error checking, then emits the full string. This means that `this.emitWithState('BookIntent')` actually becomes `this.emit('BookIntent_CONFIRMMODE')`. It is therefore **not** used to emit the state to any of the preregistered handlers, to store the state, or anything like that. `this.emitWithState(':tell')` will return an error, as it will try to emit `this.emit(':tell_CONFIRMMODE')` which doesn't exist. It is only intended to allow movement within and between state handlers.

#### Why can I use 'NewSession', even though it's not an intent? What others are there like that?

It handles certain types for you. The ones it does are 'NewSession' (which overrides any intent if you've made that. listener), 'LaunchRequest', 'Unhandled' (which is called if there are no listeners present), 'SessionEndedRequest', 'AudioPlayer[...]', and 'PlaybackController[...]'. These can all therefore be used as listener keys even though they aren't technically 'intents' as such.

#### Do all listeners need to be intents?

No. I use a bunch of listeners that aren't intents in Room Finder, just to neaten my code.

#### What does `this` refer to in my functions? Maybe the individual handler, or the EventEmitter?

***None of the above.*** It refers to a 'handlerContext' object, which is defined in the SDK backend. If you want the real details of what you can access through this variable, I'd suggest reading the backend documentation I've written up. Here's the basics - when reading this, assume `this` refers to the overall `handler` object whenever used.

```javascript
on: this.on.bind(this),
emit: this.emit.bind(this),
emitWithState: EmitWithState.bind(this),
state: this.state,
handler: this,
i18n: this.i18n,
locale: this.locale,
t : localize, // Function that uses i18n to translate
event: this._event,
attributes: this._event.session.attributes,
context: this._context,
name: eventName,
isOverridden: IsOverridden.bind(this, eventName), //  Function that tells you whether there is more than one listener for a particular event string.
response: ResponseBuilder(this) // Function that returns a function to generate responses. Ignore.
```

#### Why can't I reset the state to the default state, an empty string?

At time of writing, there's a bug in the SDK that prevents this. I've submitted a pull request, so I'm hoping they fix it some way or another. In order to workaround this, instead of just putting `this.handler.state =""`, put both these lines:

```javascript
this.handler.state = "";
this.handler.response.sessionAttributes.STATE = "";
```

You only need to do this for the empty string.

#### Can I emit two events at the same time?

Provided you don't need them to happen synchronously, and they don't both send something to Alexa - yes. I still don't recommend doing it. The issue is that the current SDK uses `context.succeed()` rather than `callback()` when it's done. While `callback` waits for the Node event loop to be empty before it runs, `context.succeed()` doesn't. Therefore you currently can't guarantee that simultaneous asynchronous events will finish, if `context.succeed()` is called too early.

# Room Finder

## Structure

Here's the conversation tree that Room Finder uses:

![Conversation Tree](https://cloud.githubusercontent.com/assets/20475469/24461686/c84a9dae-1499-11e7-9e5b-0db89961eb1b.png)

Simply put, first it asks the user if they want to book a room, then it asks them how long, then it asks them to confirm the booking. Follow right down the center of the tree for the main functionality.

This requires two custom intents, one called BookIntent (which is both used to ask to book, and to confirm a booking), and one called DurationIntent. The handlers should also support all the specified built-in intents.

All the states are set up and registered as handlers in [lambda/index.js](../lambda/index.js).

## Files

For abstraction, my code is split into four files. If you want to maintain this structure, please follow these concepts:

- [lambda/index.js](../lambda/index.js) should contain all the main intent handlers, and is what is called by AWS Lambda.
- [lambda/requesters.js](../lambda/requesters.js) should contain all the functions that make requests to the MS Graph API.
- [lambda/resources.js](../lambda/resources.js) should contain all strings used by index.js. (Though there are a couple of unviewed strings in [lambda/requesters.js](../lambda/requesters.js).)
- [lambda/config.js](../lambda/config.js) should contain all the values that need to be set to reconfigure it to work for a different business. This is now only the App ID, and the names of the Meeting Rooms, though they may want to change some resources as well.

## Non-Intent Handlers

In order to make my code easier to read and debug, I made `nonIntentHandlers`, which are registered with the Intent Handlers, but which don't handle intents. For that reason, I prefaced all of them with a `:` just like the SDK does its preregistered intents. Here is the documentation for them:

- `:askHandler` - takes a `speechOutput` and a `repromptSpeech`. It stores these as session attributes, then calls `this.emit(':ask')` using the parameters above. This means that the last speech outputs are easily registered as session attributes, which allows Alexa to repeat itself. Can totally replace `this.emit(':ask')`.

- `:repeatHandler` - takes no parameters. Very simply calls `this.emit(':ask')` using the last things said, which are (hopefully) already stored as attributes.

- `:startOverHandler` - takes no parameters. Sets the state to an empty string (using the workaround detailed above), resets all the attributes to undefined, then emits a `LaunchRequest`. Effectively resets the session.

- `:errorHandler` - takes one `error` parameter. Designed to report all request errors. Feel free to edit this one if you want to log errors in a different way. It both logs errors in the console, and puts them on a card to be seen in the Alexa app/web-app.

*All the remaining nonIntentHandlers are called successively by DurationIntent in TimeMode. Each one handles a different stage of the room finding process.*

- `:durationHandler` - takes a ISO-8601 duration parameter. Checks if this parameter is valid, and not over 2 hours, then stores the start time, end time and duration as attributes. It then emits `:getRoomHandler`...

- `:getRoomHandler` - uses the attributes stored by `:durationHandler` to find a free room, then stores its credentials as attributes. It then emits `:roomFoundHandler`, passing the credentials to it...

- `:roomFoundHandler` - uses the passed credentials to check if a valid room was found, and if so changes the state to CONFIRMMODE and emits an appropriate `':ask'` event.

**All the other handlers are just intent handlers, to make up the conversation tree above.**

## Requesters

The [lambda/requesters.js](../lambda/requesters.js) file contains a set of functions that make requests to the Microsoft Graph API. The available functions are `getCalendars()`, `postRoom()`, and `findFreeRoom()`. All of these functions return [Q promises](https://github.com/kriskowal/q) - I still personally think Q is still better supported than ES6 promises, which is why I used it. This means the appropriate way to use them is `requesters.function(...).then((returned) => {...})`.

All these functions also use the [request](https://github.com/request/request) package to make their API request.

#### `getCalendars(token)`

Passed a token, this just returns an promise resolved to an object showing the calendars in the default calendar list of the user, or it rejects with an error. The default calendar list of the user must include the meeting rooms, so they much be explicitly shared with Alexa's account.

#### `findFreeRoom(token, startTime, endTime, names, parsedCals)`

Passed a token, times formatted as values, the array of names of meeting rooms, and the object returned by getCalendars, this returns the a promise resolved to the key credentials of the first free room it finds.

It does this by looping through the `parsedCals` object. For each calendar:
 - Check if its name is in `names`.
 - If it is in `names`, get its calendarView for the specified time.
 - Check if its calendarView is empty for the specified time.
 - If it is empty, return some 'credentials' in a JSON. startTime and endTime with findFreeRoom and postRoom, or this could result in errors.
 Here's how the credentials are structured:
    ```
    {
      ownerName: "string", // e.g. Meeting Room 1.0
      ownerAddress: "string", // e.g. meetingroom1.0@business.com
      name: "string", // e.g. Meeting Room 1.0
    }
    ```
 - If all calendars either aren't in `names`, aren't `free`, or return errors, it returns a promise resolved to `false`.

 Each API requests in findFreeRoom is done asynchronously.

 A note on `findFreeRoom`'s' method: this function uses a simple counter system to figure out whether a calendar is available. One could use `Q.any()` for almost the same effect, but I used to do this, and unless you further complicate the code, it makes it much harder to differentiate 'no rooms available' from 'an error occurred'. The other alternative is `Q.allSettled()` but that requires every API request to finish before the code returns, which worsens performance, and risks more timeouts. I think this method is the least of three evils.

#### `postRoom(token, ownerAddress, ownerName, startTime, endTime)`

Passed a token, an address to make a calendar on, the name of that calendar, and the same start time and end time as passed earler, this posts a room.

It **does not directly write on the room resource calendar.** It instead posts an event on Alexa's calendar, and invites the room using the address provided. The benefit of this is that your account requires fewer permissions. The problem is it relies on the rooms accepting the invites.
