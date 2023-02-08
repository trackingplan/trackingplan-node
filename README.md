[//]: <> (This file is meant for public user consumption.)

# Official Trackingplan SDK for Node.js

This is the code repository of the Trackingplan Node SDK. If you are interested in other SDKs for a different programming language or platform, please ask the [Trackingplan team](mailto:team@trackingplan.com).

## How it works

Trackingplan works by _listening_ to the requests your code makes to your current analytics services. These requests are asynchronously forwarded to the Trackingplan server, where they are parsed and analyzed looking for changes and potential errors in the received data. No data is returned to the clients.

The script uses a sampling mechanism to avoid sending all the generated requests. Only a statistically significant amount of requests are forwarded.

## Installing Trackingplan

### Add the script to your site

Installing Trackingplan is simple. Among others, we support the following methods:
* Include the library as an npm package with `npm -i @trackingplan/node`.
* Download trackingplan.js it and include it manually.


Once our library is included:
1) Import it with `import Trackingplan from '@trackingplan/node'`
2) Initialize it with `Trackingplan.init("YOUR_TP_ID", {"environment": "PRODUCTION"})` to start monitoring. See options below.

Note that the `init` call above should show your personal Trackingplan ID. Please replace `YOUR_TP_ID` with your personal Trackingplan ID which you will find in your plan's settings page.

As soon as the snippet is deployed on your site, it will start sampling data to create your tracking plan. It does not need to load more scripts from remote servers to start working. Only the sampling rate will be downloaded from our servers.

### Listening

When installed, the Trackingplan SDK attaches a _listener_ to all the remote tracking requests emitted by the analytics provider SDKs. This listener works in the background as non-blocking and, therefore, does not interfere with the original request that the provider's client makes.

The technical procedure for listening to the requests is very simple: The JavaScript methods used to make the requests are wrapped by our code. In this way, when the analytics services use them to send the tracking info, two things happen:
1. First, the original action is performed (i.e. the request is sent to the analytics provider).
2. In a non-blocking manner, and only if the request URL matches with a known analytics services domain, the request is fowarded to our server.

Note that the used implementation is similar to the one used in the actual analytics provider clients, and also employed in the case of browser extensions, testing suites and debugging tools.

### Sampling

Trackingplan does not track every single request your site sends to the analytics providers, but rather performs statistical sampling on your users to provide your plan with traffic frequencies and validate its implementation. This way, your tracking plan is always updated, and you can take advantage of the inconsistencies and errors we may detect.

The *user sampling rate* of your plan is set by us based on your traffic and downloaded only once per day and user. This data cannot be used to track your user in any manner.

Before the _sampling rate_ is downloaded, every request to Trackingplan is queued. That way, all the different events we monitor for you appear at our servers with the same probability.

### Advanced options

The `init` call can also receive an `options` dictionary, that allows you to set some advanced parameters.

| Parameter     | Description                                                                                                                                                                                                                                                                             | Default value | Example                        |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|--------------------------------|
| `debug`         | Shows Trackingplan debugging information in the console | `false` | `true` |
| `dryRun` | Combined with `debug` allows you to debug Trackingplan without sendind data to its servers | `false` | `true` |
| `environment`   | Allows to isolate the data between production and other environments | `PRODUCTION`  | `DEV` |
| `sourceAlias`   | Allows to differentiate between sources | `node` | `IOS App` |
| `tags`         | Allows to classify the traffic and warnings detected | {} | `{"appVersion": "12.4"}` |
| `customDomains` | Allows to extend the list of monitored domains. Any request made to these domains will also be forwarded to Trackingplan. The format is `{"myAnalyticsDomain.com": "myAnalytics"}`, where you put, respectively, the domain to be looked for and the alias you want to use for that analytics domain. | `{}`            | `{"mixpanel.com": "Mixpanel"}` |
| `providersWhitelist` | If used, only specified analytics providers with be monitored.  | `["amplitude", "bing", "chartbeat", "customerio", "facebook", "heap", "hotjar", "hubspot", "intercom", "klaviyo", "kissmetrics", "linkedin", "matomo", "mixpanel", "optimizely", "pinterest", "podsights", "reddit", "segment", "snowplow", "tiktok", "twitter", "googleanalytics"]` | `['segment', 'googleanalytics']` |
| `contentFilters`         | If used, only payloads or endpoints that include any of the passed texts will be monitored | null | `["test.com", "GTM12345678"]` |


## Need help?
Questions? Problems? Need more info? We can help! Contact us [here](mailto:support@trackingplan.com).


## Learn more
Visit www.trackingplan.com


## License
Copyright © 2023 Trackingplan Inc. All Rights Reserved.
