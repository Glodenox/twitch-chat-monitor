# Twitch Chat Monitor

Code for a simple web page that just shows the chat messages of a Twitch channel in a bigger font so it can be easily displayed on a big monitor for room-scale Twitch streaming.

Variant of https://github.com/paul-lrr/nifty-chat-monitor that uses the Twitch API instead of relying on the embed page.
This has the advantage of not requiring updates every now and then when the layout changes slightly, causes less stuff to be loaded and gives full control over the layout.

At the moment this script is geared towards only LoadingReadyRun, but all implemented features are potentially useful for all channels.

Currently still missing features compared to the nifty-chat-monitor userscript:
- Customisability as a whole, the settings button doesn't work yet
- Showing inline images
- Showing any messages other than regular messages (bits, subscriptions, raids, ...)
