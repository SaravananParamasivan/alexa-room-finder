# Alexa Skills Kit SDK for Node.js - Under the Hood [Draft 1.1]

This is intended to explain - top-down - how the [Alexa Skills Kit SDK for Node.js](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs) works. I'm hoping this will assist with the maintenance of my skill. There are several issues with their code that merit explanation, so I've tried to go into code-level detail; hopefully this isn't too much detail...

To summarise my (obviously subjective) opinion: the Alexa SDK is fairly poorly coded, and very poorly documented. It's certainly better than I could have done, and it's very easy to start using it, but it's unclear precisely how anything works unless you read the (uncommented) Javascript.

As a framework for explaining the SDK, let's look at how the SDK is actually used from your main `index.js` file. None of the back-end of these things is really explained by the Amazon documentation, but here's what they tell you to write.

```
exports.handler = (event, context) => {
  const alexa = Alexa.handler(event, context);
  alexa.appId = appId;
  alexa.resources = languageStrings;
  alexa.registerHandlers(sessionHandlers)  
  alexa.execute();
};
```

Note that `exports.handler = (event, context) => {}` is just for AWS lambda support. By default Lambda (using Node) will run the exported `index.handler` on execution, with `event, context, callback` as parameters. Therefore, you can just imagine the contents of that arrow function as the 'main' code being run. To explain, I thought it actually made sense to go top-down, and cover each line of this 'main' code in order.

---

### Before we start, here are things I currently gloss over

- ResponseBuilder and Audio Player support, as I'm not using it.

---

## Line 1: Creating the handler object

The vast bulk of the code is definitely run by the first line: `const alexa = Alexa.handler(event, context);`. `Alexa.handler` is a function (defined in `alexa.js`) that, using an event and context as parameters, returns an object of type `AlexaRequestEmitter`. This object extends the [EventEmitter class from the Node events module](https://nodejs.org/api/events.html). EventEmitters are very simple, and totally standard in Node. Here's (at a very basic level) how you use one:

```
myEmitter.on('event', () => {
  console.log('An event occurred!');
});
myEmitter.emit('event');
```

`.on()` sets up a listener, which will just perform its particular function when the right 'eventName' is passed to the emitter via `.emit()`.

This means we're going to set up a big EventEmitter can detect any of our 'Intents', then do a function. Simple.

**NB:
- In line 4, you can register several different intent handler objects, but they will all be registered in this same EventEmitter, in pretty much the same way. They are in no way separate, so events can be emitted from one 'handler' or 'state handler' to another.
- The default max number of listeners per EventEmitter is 10. The SDK overrides this to 'Infinity'. This is technically bad practice, but there's no other way for them to easily make an emitter of arbitrary size.
- You may read in the EventEmitter documentation that by default, `this` in a listener-attached function refers to the EventEmitter object. The SDK chooses to override this (without appropriately documenting the API), so that is not the case here. We'll get back to this later.**

After the AlexaRequestEmitter (which confusingly is named `handler`) is declared, the function gives it a bunch of properties, which for the most part will be set later. The simple ones are:

- \_event: event (from lambda parameters)
- \_context: context (from lambda parameters)
- \_callback: callback (from lambda parameters, if provided)
- state: null
- appId: null
- response: {}
- dynamoDBTableName: null
- saveBeforeResponse: false
- i18n: i18n (the 'i18next' module variable)
- locale: undefined
- resources: undefined

`event` is the request object, formatted as described [here](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/alexa-skills-kit-interface-reference#request-format).

`context` is the context object of the **Lambda function** (not to be confused with `event.context`) and is documented [here](http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html).

The `handler` function also gives its EventEmitter two more properties, which are two functions: `registerHandlers` and `execute`. These actually call two other functions `RegisterHandlers()` and `HandleLambdaEvent()`, but bind the `this` of these functions to the AlexaRequestEmitter object. This means that whenever these functions use `this`, they refer to the AlexaRequestEmitter, not the function's own `this`. We'll cover what `HandleLambdaEvent()` when it's called later; it only makes sense to cover RegisterHandlers now.

### What does this RegisterHandlers/registerHandlers function do?

This function takes as arguments any number of objects - these are the handlers you set up when using the SDK. It goes through the properties, and for each one, sets up a listener in EventEmitter. It uses the property key as the event name, and the value as the callback. However, registerHandlers does have a few quirks.

- Firstly, it can handle 'State Handlers'. These are just normal handlers, but they've been given a `\_StateString` property when you called the 'CreateStateHandler' function. In order to differentiate the same intents when in different states, the SDK simply appends the value of the `\_StateString` property to all the event names in the handler. This means that `BookIntent` listener in the `_CONFIRMMODE` state will be set up as `this.on('BookIntent_CONFIRMMODE', [...]);`. This is how listeners for the same 'intents' with in different 'states' can all be set up in the same EventEmitter object.

- Secondly, **it binds each function to a new variable named handlerContext.** This means that when you use `this` in your listener callback, it refers to 'this' object right here:

  ```
  var handlerContext =
  {
      on: this.on.bind(this),
      emit: this.emit.bind(this),
      emitWithState: EmitWithState.bind(this),
      state: this.state,
      handler: this,
      i18n: this.i18n,
      locale: this.locale,
      t : localize,
      event: this._event,
      attributes: this._event.session.attributes,
      context: this._context,
      name: eventName,
      isOverridden:  IsOverridden.bind(this, eventName),
      response: ResponseBuilder(this)
  };
  ```

  So, what do the `this` keywords within the handlerContext variable refer to? You might immediately think they refer to handlerContext itself; however, they've also been overridden, as you'll remember our `RegisterHandlers` function is bound to the `handler` object we created earlier. Therefore they all refers to the `this` of the AlexaRequestEmitter object created earlier.

  Here's an example. If you request `this.attributes` in your listener callback, it's bound to `{handlerContext}.attributes`. This was taken from `{handler}._event.session.attributes`, so what you get is the `session.attributes` property of the `_event` property of our `handler` variable. You'll remember this `_event` was set to be the request body itself when we set up that handler, so it gives the session attributes of the request.

---

**Summary: When you use `this` in your function, it actually refers to a handlerContext variable, which is set up to use the properties of the handler, and a few extra functions.**

---

What are those extra functions? That's a good question.

- `emitWithState: EmitWithState.bind(this)` is a function that will append the current state to its first argument (whatever Intent you want to emit), then call `{handler}.emit.apply({handler}, arguments)`. This means it will just emit an intent to our EventEmitter with a state appended to it. This is used for movement 'between state handlers'.
- `t: localize` leads to some more fairly complex 'this' binding. Ignoring most of this for abstraction reasons, using `this.t()` in your handler functions will call `{handler}.i18n.t.apply({handler}.i18n, arguments)` - i.e. it will call the 'translate' (t) function of the handler's i18n property, and use the i18next object itself as the `this` keyword. We still have to set up the backend for the i18next, but this simply makes the translate usable from the listener callbacks.
- `isOverridden: IsOverridden.bind(this, eventName)` is a function used by the SDK to detect whether you've overridden any of the default listeners that are going to be registered. I wouldn't recommend ever using it yourself, as it can't detect the 'overriding' listener from the 'overridden'; it simply returns true if the number of listeners for the given 'event name' is greater than 1. This is fine for the SDK's purposes.
- `response: ResponseBuilder(this)` is an odd one. In its present form, I think it's totally useless. First, it's unmentioned in what little documentation there is, and isn't actually used by the SDK itself. But more importantly, it doesn't work:

    - **Here's a quick explanation of what it does:** `ResponseBuilder` is a closure that you can access through `this.response`; this closure returns an object with functions that allow you to edit a responseObject variable that is private to the closure. This basically allows one to abstract the manual set-up of a response object, and store that in the `responseObject` variable. It's also chainable, as each of the object's functions returns `this`. So for example `this.response.speak("foo").listen("bar");`, creates a response object which is pretty much equivalent to the one sent by `this.emit(":ask", "foo", "bar");` - but instead of emitting that object, it stores that object in the responseObject variable.

    - **Here's what I don't get:** The responseObject variable is private to the closure, so can't actually be retrieved without some significant edits/workarounds. It also doesn't mutate the actual `this.handler.response` object (even though responseObject is a copy of that object.) Therefore, this function seems kinda pointless. It can edit responseObject to make a functional response, but you can't then actually retrieve it... It's therefore just confusing at the moment, as beginners might think it's the same as `this.handler.response`.

    - **this.response would have one major use, which is audio player support.** If you wish to use the audio player, I would strongly suggest looking at [the documentation](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/custom-audioplayer-interface-reference), then reading the ResponseBuilder functions themselves, as they are fairly self-explanatory. You will however need to fix the ResponseBuilder function so this works.

    - **Heres how I'd fix it:** Very simply, add a new getter property to the object that `ResponseBuilder` returns:
      ```
      'getResponseObject': function () {
        return responseObject;
      }
      ```
    Then you can do stuff like this:
      ```
      this.handler.response = this.response.speak('foo').listen('bar').getResponseObject();
      this.emit(':responseReady');
      ```

    This basically allows you to bypass `this.emit(':ask')`, and set up your own response to emit to `':responseReady'`.

---

**Summary of RegisterHandlers: Passed objects as parameters, this registers all the properties of all those objects as listeners in the handler object (which extends EventEmitter.) Those listeners are bound to a `handlercontext` variable**

---

The neat part of the SDK, is that after it makes this object, the `handler` function then registers its own default set of listeners in the same way as you register yours - using the `registerHandlers()` function we just covered. This set of handlers can be found in `response.js`. They are the default API you interact with when making your conversation tree, and their event names are:

- ':tell'
- ':ask'
- ':askWithCard'
- ':tellWithCard'
- ':tellWithLinkAccountCard'
- ':askWithLinkAccountCard'


- ':responseReady'
- ':saveState'
- ':saveStateError'

**Notably, any of these handlers can be safely overridden from index.js, so feel free to write your own ':ask' or ':tell' if you want to.**

Fundamentally, what the first 6 of these do, is

1. Build a response object from the parameters you give it
2. Set `this.handler.response` to this response
3. Emit ``':responseReady'``

Let's take a look at those in more detail:

1. In order to build a [response object](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/alexa-skills-kit-interface-reference#response-format) from the parameters, they all call the `buildSpeechletResponse()` function with the various parameters stored in an object. `this.attributes` is always used as one of these parameters, and is used to set the session attributes of the response.

    `buildSpeechletResponse()` itself very simply parses the parameters, and builds a properly formatted JSON response, as documented [here](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/alexa-skills-kit-interface-reference#response-format).

    **Note that buildSpeechletResponse automatically wraps speech in SSML tags, without checking for broken characters within. Therefore you must escape characters like `&` with a backslash.**

2. The response is stored in `this.handler.response`. This should not be confused with `this.response` which is different. Notably, `this.handler.response` also contains `this.handler.response.response`, which is basically the subset of the response that will actually be spoken by Alexa.

3. The `'':responseReady'` listener doesn't do much except set the state in the session attributes of the response, emits `':saveState'` if you want to save the session attributes in DynamoDB, then calls `this.context.succeed(this.handler.response)`, which - assuming your Lambda function is using RequestResponse - sends off your event to the Alexa Skill.

    **NB: While simple, the `:responseReady` listener has two big issues:**

    1. Because of responseReady, you can't reset the state to an empty string, the default state. Here's why:

    To detect if you've changed the state, meaning it should change the 'STATE' session attribute, the `':responseReady'` listener uses `if(this.handler.state)`. The problem is that empty strings are falsey, so if you set `this.handler.state = ""`, then it won't actually reset the state.  I'm actually unsure whether this 'bug' is deliberate - some people have suggested it is, as DynamoDB can't store empty strings. I think there might be some resolution to this using 'undefined' rather than an empty string.

    Anyway, this can be easily bypassed without editing the SDK if one simply sets the session attribute directly. You must also change `this.handler.state` at the same time, or it will just reset to what it was before.

    ```
    this.handler.state = "";
    this.handler.response.sessionAttributes.STATE = "";
    ```

    2. This isn't a bug, but technically `this.context.succeed` should no longer be used, as it's been effectively deprecated. It would be much better to use `callback`. We submitted a pull request to fix this, but it's not been accepted quite yet.

OK! Now that the SDK has registered it's default listeners, the first line is finally done.

## Line 2 and 3: Some config

`alexa.appId = appId; alexa.resources = languageStrings;` just set the resource and appId properties of the `handler` to the configuration values need to be. We'll cover where these are used in Line 5, when we cover `execute`.

## Line 4: Registering Handlers

This just registers your personal listeners, in the `handler` object, following the method described above. A useful thing to note, is that not all of these listeners have to be events. If (like me) you want to use them for abstraction, for example, I like register like a `':askHandler'` listener that automatically sets speech attributes (for repeating) and then emits ask:

```
':askHandler': function(speechOutput, repromptSpeech) {
  this.attributes.speechOutput = speechOutput;
  this.attributes.repromptSpeech = repromptSpeech;
  this.emit(':ask', this.attributes.speechOutput, this.attributes.repromptSpeech);
},
```

Then you just call `this.emit(':askHandler', speechOutput, repromptSpeech)` and the attributes are handled for you. This sort of abstraction keeps the `emit` there, so it's clear that content is being emitted, requires no nasty binding like a function might (as `this` points to the right place already) and can clean up your code a lot.

## Line 5: Execution

This line calls the `execute` property of the `handler` object we made earlier. You'll remember we deliberately skipped the `execute` function earlier. This is because it's first used now. Here's what it does: *As a reminder, the handler object is of type `AlexaRequestEmitter` which extends `EventEmitter`. It has a bunch of properties, including the registerHandlers function, and this execute function we're using now. We also just registered a bunch of handlers in it.*


1. It calls `HandleLambdaEvent()` bound to the `handler` object. This function sets the locale to whatever Alexa sent over, and sets up the back-end for translation, using the `this.resources` property we defined earlier.
2. This then calls `ValidateRequest()`, again bound to the `handler` object. This function checks that the App IDs match. If it's a new session and a table name is set, it will also pull any saved session attributes from DynamoDB. See below for more details.
3. This then calls `EmitEvent`, again bound to the `handler` object - there's a lot of nested binding here. This function then checks which 'type' of event it is (from the possible types of `NewSession`, `LaunchRequest`, `SessionEndedRequest`, `IntentRequest` `AudioPlayer[...]` and `PlaybackController[...]`, and sets the variable `eventString`, to either the type, or the intent name if it's an `IntentRequest`. This is what allows you to use `NewSession` and `LaunchRequest` as 'intents' in your main handler code, even though they're actually types in the request body.

  It then appends the state to the eventString, checks there's a listener with this name, and calls `this.emit(eventString)`, activating whichever intent has been sent through.

  This intent in turn emits one of the pre-registered events (say `this.emit(':tell')`), which in turn emits `this.emit(':responseReady')`. Finally, this builds a response, and then calls `context.succeed(this.handler.response)`, a prebuilt Lambda function that sends our skill off to Alexa.

## DynamoDB Support and `:saveState`

The SDK includes support for DynamoDB. To get a very basic intro to the DynamoDB terms I'm using, see [here](http://docs.aws.amazon.com/amazondynamodb/latest/gettingstartedguide/quick-intro.html). You'll also need to give your lambda function permission to access DynamoDB if you want to use this support.

So how is DynamoDB integrated into the SDK? First, the SDK is only designed to retrieve and save attributes. If you want to do more than that, you'll need to do it yourself.

### Getting attributes

Attributes are retrieved during `ValidateRequest()` (which is called by `alexa.execute()` before it emits the event to our handler), our program pulls any saved session attributes from DynamoDB. It only does this if you've set a predetermined table name via `alexa.dynamoDBTableName = ""`. It pulls the values using `attributesHelper.get`, which can be found in the `DynamoAttributesHelper.js` file. Here's how that 'get' function works.

---

#### attributesHelper.get(table, userId, callback)

This uses the [aws-sdk](https://aws.amazon.com/sdk-for-node-js/) module to facilitate requests to DynamoDB.

It first does a `get` query on the named table using the UserID as a parameter.

- If *a table with the right table name doesn't exist*, it will make you a new table, and `callback` with an empty object.
- If *a table with the right table name does exist*, it will then query the table by the userId of the request.
  - If *the user ID doesn't exist in the table* (i.e. it's the first time they've used that skill) it will `callback` with an empty object.
  - If *the user ID does exist in the table*, it will `callback` with the `mapAttr` attribute stored at that userId, which is an object storing 'session attributes'.

---

In this case, the `callback` is to very simply assign the attributes to the `this._event.session.attributes` property. Note that the attributes are user-specific, but it all works on one big DynamoDB table, which stores all the attributes of every user. *This table is structured as follows. Each item in the table has one 'userId' and one 'mapAttr' attribute. The 'partition key' (by which the table is partitioned, and by which items are identified) is the 'userId' attribute. The 'Alexa Skill session attributes' of each user are stored under the 'mapAttr' attribute.*

### Setting attributes

Attributes are saved during `this.emit(':responseReady')`, or if you emit `this.emit(':saveState')` yourself. Even then, they are only saved in these scenarios:

1. The session is about to end.
2. In theory, if you've manually set the `handler.saveBeforeResponse` value to true. In practice... **There's another SDK bug here. They check this.saveBeforeResponse rather than this.handler.saveBeforeResponse. I've submitted a pull to fix this.**
3. You included a true `forceSave` parameter when emitting saveState. By default, `':responseReady'` doesn't do this when it emits saveState.


It then uses `attributesHelper.set`, which can be found in `DynamoAttributesHelper.js` to store your attributes in `this.attributes`. (This obviously means you should always set your attributes through `this.attributes`, rather than say `this.handler.response.attributes` or even `this.handler.event.session.attributes`).  *Don't worry about `this.handler.state`, it will move that to `this.attributes.STATE` before it saves.*

---
#### attributesHelper.set(table, userId, data, callback)

This uses the `aws-sdk` module to facilitate requests to DynamoDB.

Skipping a bit of error handling, this fairly simply does a `put` query on the table, using these parameters.

```
{
    Item: {
        userId: userId,
        mapAttr: data
    },
    TableName: table
};
```

This means it puts a new item into the table with the `userId` and `mapAttr` attributes. It then calls `callback(err, data)`.

---
In the case of `':saveState'`, the `callback` used very simply does some error logging by emitting `':saveStateError'`.

`':saveState'` also effectively overrides `this.emit(':responseReady')` and does the `this.context.succeed()`. **I believe this to be a bug, as it says it specifically shouldn't do this in their documentation. I'm looking to submit a pull to fix this.** Therefore, if you emit `':saveState'` yourself, make sure your `this.handler.response` is already set up, and ready to send off to Alexa.

### DynamoDB Summary

The SDK actually provides pretty good DynamoDB support. As they promise, pretty much the only condition to implement automatic attribute saving is to set `alexa.dynamoDBTableName`. However, `':saveState'` and the functions in `DynamoAttributesHelper.js` are pretty much only good for saving current attributes. If you want to do anything more complex, rewrite versions of these functions yourself using [aws-sdk](https://aws.amazon.com/sdk-for-node-js/).
