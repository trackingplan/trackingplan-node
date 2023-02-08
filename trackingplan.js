/**
Usage:
Trackingplan.init("TP1234567");
or
Trackingplan.init("TP1234567", {
    [, sourceAlias: "MyWeb"]
    [, environment: "staging"]
    [, tags: {"tag1": "value1"}[, ...]]
    [, customDomains: {"MyAnalyticsDomain.com": "MyAnalytics"[, ...]}]
    [, debug: true]
    [, contentFilters: ["event1", "event2"[, ...]]]
    [, providersWhitelist: ["googleanalytics", "segment"[, ...]],

});
**/

const { ClientRequestInterceptor } = require('@mswjs/interceptors/lib/interceptors/ClientRequest');
const { XMLHttpRequestInterceptor } = require('@mswjs/interceptors/lib/interceptors/XMLHttpRequest');
const { FetchInterceptor } = require('@mswjs/interceptors/lib/interceptors/fetch');
const { BatchInterceptor } = require('@mswjs/interceptors')



var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
var has = Object.prototype.hasOwnProperty;

// Needed to avoid repeating global variables after minimization
var tpStorage = require('localStorage');
var tpConsole = console;


// TODO: Check Do not include the script twice.


// Left side could be turned into regex.
var _defaultProviderDomains = {
    "google-analytics.com": "googleanalytics",
    "analytics.google.com": "googleanalytics",
    "api.segment.io": "segment",
    "segmentapi": "segment",
    "seg-api": "segment",
    "segment-api": "segment",
    "/.*api\-iam\.intercom\.io\/messenger\/web\/(ping|events|metrics|open).*/": "intercom",
    "api.amplitude.com": "amplitude",
    "ping.chartbeat.net": "chartbeat",
    "/.*api(-eu)?(-js)?.mixpanel\.com.*/": "mixpanel",
    "trk.kissmetrics.io": "kissmetrics",
    "ct.pinterest.com": "pinterest",
    "facebook.com/tr/": "facebook",
    "track.hubspot.com/__": "hubspot",
    "/.*\.heapanalytics\.com\/(h|api).*/": "heap",
    "/.*snowplow.*/": "snowplow",
    "/.*ws.*\.hotjar\.com\/api\/v2\/client\/ws/%identify_user": "hotjar",
    "/.*ws.*\.hotjar\.com\/api\/v2\/client\/ws/%tag_recording": "hotjar",
    "klaviyo.com/api/track": "klaviyo",
    "app.pendo.io/data": "pendo",
    "matomo.php": "matomo",
    "rs.fullstory.com/rec%8137": "fullstory",
    "rs.fullstory.com/rec%8193": "fullstory",
    "logx.optimizely.com/v1/events": "optimizely",
    "track.customer.io/events/": "customerio",
    "alb.reddit.com/rp.gif": "reddit",
    "px.ads.linkedin.com": "linkedin",
    "/i/adsct": "twitter",
    "bat.bing.com": "bing",
    "pdst.fm": "podsights",
    "analytics.tiktok.com/api/v2": "tiktok"
}

var _providerDomains = {}

var _tpId = null;

//
// Start of options
//

var _environment = "PRODUCTION";

var _sourceAlias = null;

// Method to send hits to tracksEndpoint.
var _sendMethod = "xhr";

var _debug = false;

// Remember the trailing slash
var _tracksEndPoint = "https://tracks.trackingplan.com/v1/";

var _configEndPoint = "https://config.trackingplan.com/";

// For testing queue and sync purposes.
var _delayConfigDownload = 0;

// Sample Rate Time To Live in seconds.
var _sampleRateTTL = 3600;

// Sampling mode:
//   user - Per user,
//   track - per track,
//   all - send all tracks (debug),
//   none - block all (debug)
var _samplingMode = "track";

// Max batch size in bytes. Raw track is sent when the limit is reached.
var _batchSize = 512000;

// The batch is sent every _batchInterval seconds.
var _batchInterval = 30;

// Send new user on every load
var _alwaysSendNewUser = false;

// Do everything except actually sending the data to trackingplan.
var _dryRun = false;

// Enabled interception modes. Available are 'msw'
var _intercept = ['msw'];

// Callback function when a batch is sent.
var _onSubmit = function (request, response) { };

var _onQueue = function (raw_track) { };

var _onBeforeSubmit = function (payload) { return payload; };

// Do ask for real time parsing
var _parse = false;

// Tags
var _tags = {};

// ContentFilter
var _contentFilters = []

// Providers whitelist (only providers in this list will be intercepted). Use white or blacklist.
var _providersWhitelist = null

//
// End of options
//

var _sampleRateKey = "_trackingplan_sample_rate";
var _sampleRateTSKey = "_trackingplan_sample_rate_ts";
var _isSampledUserKey = "_trackingplan_is_sampled_user";

var _sampleRateDownloading = false;

var _preQueue = [];
var _postQueue = "";


var _commonPayload = null;
var _commonPayloadLength = 0;

var _intervalId = null;
var _interceptor = null;



const Trackingplan = {

    sdk: "node",
    sdkVersion: "1.0.4",

    /**
     * Default options:
     * {
     *      environment: "PRODUCTION",
     *      sourceAlias: null,
     *      sendMethod: "xhr",
     *      customDomains: {},
     *      debug: false,
     *      tracksEndpoint: "https://tracks.trackingplan.com/",
     *      configEndpoint: "https://config.trackingplan.com/",
     *      delayConfigDownload: 0,
     *      sampleRateTTL: 86400,
     *      samplingMode: "track",
     *      batchSize: 512000,
     *      batchInterval: 20,
     *      dryRun: false,
     *      intercept: ['mws'],
     *      tags: {},
     *      contentFilters: [],
     *      providersWhitelist: null,
     *
     * }
     */

    setOptions: function (tpId, options) {
        options = options || {};
        _tpId = tpId;
        _environment = options.environment || _environment;
        _sourceAlias = options.sourceAlias || _sourceAlias;
        _sendMethod = options.sendMethod || _sendMethod;
        _providerDomains = _mergeObjects(_defaultProviderDomains, options.customDomains || {});
        _debug = options.debug || _debug;
        _tracksEndPoint = options.tracksEndPoint || _tracksEndPoint;
        _configEndPoint = options.configEndPoint || _configEndPoint;
        _delayConfigDownload = options.delayConfigDownload || _delayConfigDownload;
        _sampleRateTTL = options.sampleRateTTL || _sampleRateTTL;
        _samplingMode = options.samplingMode || _samplingMode;
        _batchSize = options.batchSize || _batchSize;
        _batchInterval = options.batchInterval || _batchInterval;
        _alwaysSendNewUser = options.alwaysSendNewUser || _alwaysSendNewUser;
        _dryRun = options.dryRun || _dryRun;
        _intercept = options.intercept || _intercept;
        _onSubmit = options.onSubmit || _onSubmit;
        _parse = options.parse || _parse;
        _onQueue = options.onQueue || _onQueue;
        _onBeforeSubmit = options.onBeforeSubmit || _onBeforeSubmit;
        _tags = options.tags || _tags;
        _contentFilters = options.contentFilters || _contentFilters;
        _providersWhitelist = options.providersWhitelist || _providersWhitelist;

        debugLog({ m: "TP options updated", options: options });
    },

    stop: function () {
        if (_intervalId !== null) {
            clearInterval(_intervalId);
            _intervalId = null;
        }

        if (_interceptor !== null) {
            _interceptor.dispose()
            _interceptor = null;
        }
        debugLog("Stopping Trackingplan")

    },

    flush: function () {
        debugLog("Flushing all pending data");
        sendBatch("xhr");
    },


    init: function (tpId, options) {
        Trackingplan.stop();

        options = options || {};
        try {
            if (_tpId !== null) throw new Error("TP Init already happened");

            Trackingplan.setOptions(tpId, options);

            installInterceptors()

            process.on('exit', () => { debugLog("exiting"); sendBatch("xhr"); });

            _intervalId = setInterval(function () {
                sendBatch(_sendMethod);
            }, _batchInterval * 1000);

            debugLog({ m: "TP init finished", options: options });

        } catch (error) {
            consoleWarn({ m: "TP init error", error: error });
        }
    }
}

function installInterceptors() {
    if (_intercept.includes('msw')) try { installMswInterceptor(); } catch (e) { debugLog(e) };
}

function installMswInterceptor() {
    if (_interceptor !== null) return;

    _interceptor = new BatchInterceptor({
        name: 'my-interceptor',
        interceptors: [
            new ClientRequestInterceptor(),
            new XMLHttpRequestInterceptor(),
            new FetchInterceptor()
        ],
    })
    _interceptor.apply();

    // Listen to request being dispatched,
    _interceptor.on('request', async (request, requestId) => {
        const requestBody = await request.text()
        processRequest({ "method": request.method, "endpoint": request.url, "payload": requestBody, "protocol": "msw" });
    })
}

function isString(value) {
    return typeof value === 'string' || value instanceof String;
}

function contentFilterRequest(request, contentFilters) {
    if (contentFilters.length === 0) return true;

    for (var i = 0; i < contentFilters.length; i++) {
        if (has(request, 'payload') && typeof request['payload'] === 'string') {
            if (request['payload'].indexOf(contentFilters[i]) >= 0) {
                return true;
            }
        }
        if (has(request, 'endpoint') && typeof request['endpoint'] === 'string') {
            if (request['endpoint'].indexOf(contentFilters[i]) >= 0) {
                return true;
            }
        }
    }
    return false;

}

function isValidProvider(provider) {
    if (_providersWhitelist !== null) {
        return _providersWhitelist.includes(provider);
    }
    return true;
}

// Decides whether or not send to trackingplan and applies data transform.
function processRequest(request, callback) {
    setTimeout(function () { // makes function non-blocking
        try {
            var provider = getAnalyticsProvider(request);
            if (request.endpoint == "TRACKINGPLAN") provider = "trackingplan";
            if (!provider) return;

            if (!isValidProvider(provider)) {
                debugLog({ m: "Request ignored (" + provider + " not in whitelist)", request: request });
                return;
            }


            if (!contentFilterRequest(request, _contentFilters)) {
                debugLog({ m: "Request ignored (content filter)", request: request });
                return;
            }

            var sampleRateDict = getSampleRateDict()
            if (sampleRateDict === false) { // here is where we queue if we still dont have the user config downloaded.
                _preQueue.push(request);
                debugLog({ m: "Pre queued, queue length = " + _preQueue.length })
                setTimeout(downloadSampleRate, _delayConfigDownload);
                return false;
            }
            if (_commonPayload === null) {
                _commonPayload = getCommonPayload();
                _commonPayloadLength = JSON.stringify(_commonPayload).length;
            }

            if (!shouldProcessRequest(_samplingMode, sampleRateDict)) {
                debugLog({ m: "Request ignored (sampling)", mode: _samplingMode, dict: sampleRateDict });
                return true;
            }
            queueOrSend(createRawTrack(request, provider));
            if (typeof callback === 'function') {
                callback();
            }

            return true;

        } catch (error) {
            consoleWarn({ m: "Trackingplan process error", error: error, request: request });
        }
    }, 0);
}

function queueOrSend(rawTrack) {
    _onQueue(rawTrack)
    var jsonTrack = JSON.stringify(rawTrack);
    if (jsonTrack.length > 200000) {
        debugLog({ m: "Track Too big, ignored: " + jsonTrack.length });
    }

    if ((jsonTrack.length + 2 + _commonPayloadLength) > _batchSize) {
        sendDataToTrackingPlan("[" + jsonTrack + "]", _sendMethod);
        debugLog({ m: "Track > Batch Size: " + jsonTrack.length });
        return;
    }

    var newBatchLength = _postQueue.length + jsonTrack.length + _commonPayloadLength;
    if (newBatchLength > _batchSize) {
        debugLog({ m: "Batch reaching limit: " + newBatchLength });
        sendBatch(_sendMethod); // sendBatch clears the _postQueue.
    }

    newBatchLength = _postQueue.length + jsonTrack.length + _commonPayloadLength;
    debugLog({ m: "Queue len: " + newBatchLength, "rawTrack": rawTrack });
    if (_postQueue.length !== 0) _postQueue += ","
    _postQueue += jsonTrack;
}

function sendBatch(method) {
    if (_postQueue.length == 0) return;

    var postQueueCopy = _postQueue;
    _postQueue = "";
    var payload = { "requests": JSON.parse("[" + postQueueCopy + "]"), "common": _commonPayload };

    sendDataToTrackingPlan(payload, method);
}

function getTracksEndpoint() {
    var tpurl = _tracksEndPoint + _tpId;
    _parse && (tpurl += "?debug=true");
    return tpurl;
}

function sendDataToTrackingPlan(payload, method) {
    if (typeof (_onBeforeSubmit) === 'function') {
        payload = _onBeforeSubmit(payload);
    }

    debugLog({ m: "Sent", payload: payload });

    function sendDataToTrackingplanWithXHR(body, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", getTracksEndpoint(), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                try {

                    debugLog({ m: "Parsed", response: JSON.parse(xhr.response) });
                    _onSubmit(body, xhr.response);
                } catch (error) { };
            }
        }
        xhr.send(body);
    }

    if (_dryRun) {
        debugLog("Not sending, is dry run");
        return;
    }

    switch (method) {
        case "xhr":
            sendDataToTrackingplanWithXHR(JSON.stringify(payload));
            break;
    }
}

function shouldProcessRequest(samplingMode, sampleRateDict) {
    switch (samplingMode) {
        case "user":
            return sampleRateDict.isSampledUser === 1;
        case "track":
            return Math.random() < (1 / sampleRateDict.sampleRate);
        case "all":
            return true;
        case "none":
        default: // we need a valid sampling mode
            return false;
    }
}

function createRawTrack(request, provider) {
    return {
        // Normalized provider name (extracted from domain/regex => provider hash table).
        "provider": provider,
        "request": {
            // The original provider endpoint URL
            "endpoint": request.endpoint,
            // The request method. It’s not just POST & GET, but the info needed to inform the parsers how to decode the payload within that provider, e.g. Beacon.
            "method": request.method,
            // The post payload, in its original form.
            "post_payload": request.payload || null,
            "protocol": request.protocol,
            // The url the event has been triggered at
        }
    }
}

function getContext() {
    // Information that is extracted in run time that can be useful. IE. UserAgent, URL, etc. it varies depending on the platform. Can we standardize it?
    return {}
}

function getCommonPayload() {
    return {
        "context": getContext(),
        // A key that identifies the customer. It’s written by the developer on the SDK initialization.
        "tp_id": _tpId,
        // An optional alias that identifies the source. It’s written by the developer on the SDK initialization.
        "source_alias": _sourceAlias,
        // An optional environment. It’s written by the developer on the SDK initialization. Useful for the developer testing. Can be "PRODUCTION" or "TESTING".
        "environment": _environment,
        // The used sdk. It’s known by the sdk itself.
        "sdk": Trackingplan.sdk,
        // The SDK version, useful for implementing different parsing strategies. It’s known by the sdk itself.
        "sdk_version": Trackingplan.sdkVersion,
        // The rate at which this specific track has been sampled.
        "sampling_rate": getSampleRateDict().sampleRate,
        // Debug mode. Makes every request return and console.log the parsed track.
        "debug": _debug,
        // Tags.
        "tags": _tags
    }
}

// Process all requests waiting in the queue.
function processPreQueue() {
    while (_preQueue.length) {
        var request = _preQueue.shift();
        processRequest(request);
    }
}

function extractSampleRate(config_obj, environment) {

    if (has.call(config_obj, 'environment_rates') && has.call(config_obj.environment_rates, environment)) {
        return config_obj.environment_rates[environment];
    } else {
        return config_obj.sample_rate;
    }
}

function downloadSampleRate() {
    if (_sampleRateDownloading) return
    _sampleRateDownloading = true;

    var xmlhttp = new XMLHttpRequest();
    var url = _configEndPoint + "config-" + _tpId + ".json";

    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            try {
                setSampleRate(extractSampleRate(JSON.parse(this.responseText), _environment));
                // Every 24 hours if a user visits the site.
                processPreQueue();
            } catch (error) { };
        }
    };
    xmlhttp.open("GET", url, true);

    xmlhttp.send();
}

// Sets the sample rate at the cookie. Set to false to invalidate.
function setSampleRate(rate) {
    if (rate === false) {
        tpStorage.removeItem(_sampleRateKey)
        tpStorage.removeItem(_sampleRateTSKey)
        tpStorage.removeItem(_isSampledUserKey)
        return
    }
    var isSampledUser = Math.random() < (1 / rate) ? 1 : 0; // rolling the sampling dice

    debugLog({ m: "Trackingplan sample rate = " + rate + ". isSampledUser " + isSampledUser })
    tpStorage.setItem(_sampleRateTSKey, new Date().getTime())
    tpStorage.setItem(_sampleRateKey, rate)
    tpStorage.setItem(_isSampledUserKey, isSampledUser)
}

// Reads the sample rate from localstorage.
function getSampleRateDict() {
    var ts = tpStorage.getItem(_sampleRateTSKey);
    if (ts === null) return false;

    if ((parseInt(ts) + _sampleRateTTL * 1000) < new Date().getTime()) { // expired
        debugLog({ m: "Trackingplan sample rate expired" });
        setSampleRate(false);
        return false;
    } else {
        return {
            "sampleRate": parseInt(tpStorage.getItem(_sampleRateKey)),
            "isSampledUser": parseInt(tpStorage.getItem(_isSampledUserKey))
        }
    }
}

function _testPattern(pattern, content) {
    if (pattern === null || content === null) return true;
    if (pattern[0] === '/') {
        var regex = new RegExp(pattern.slice(1, -1));
        return (regex.test(content));
    } else {
        return (content.indexOf(pattern) !== -1)
    }
}

function getAnalyticsProvider(request) {
    var endpoint = request.endpoint;
    var payload = request.payload;
    if (isString(endpoint)) {
        for (var pattern in _providerDomains) {
            var parts = pattern.split("%");
            var endpoint_pattern = parts[0];
            var payload_pattern = parts.length === 2 ? parts[1] : null;
            if (_testPattern(endpoint_pattern, endpoint) && _testPattern(payload_pattern, payload)) {
                return _providerDomains[pattern];
            }
        }
        return false;
    }
}

function _mergeObjects(o1, o2) {
    for (var a in o2) { o1[a] = o2[a]; }
    return o1;
}

function debugLog(m) {
    _debug && tpConsole.log("TP " + _tpId, m);
}

function consoleWarn(m) {
    tpConsole && tpConsole.warn && tpConsole.warn(m);
}


module.exports = Trackingplan;
