# Twitch Chat Monitor

Code for a web page that shows the activity in a Twitch channel in a bigger font, so it can be easily displayed on a big monitor for room-scale Twitch streaming. Because many features in the chat are not needed for a monitor, it was possible to display the same information better with less than half of the CPU and only a tenth of the working memory.

This page is based on the [Nifty Chat Monitor userscript](https://github.com/paul-lrr/nifty-chat-monitor), but uses the Twitch WebSocket API directly instead of relying on the Twitch chat embed page. This has the advantage of not requiring updates every now and then when the layout changes slightly, causes less stuff to be loaded in the background and gives full control over the layout.

This tool can be used for any Twitch channel and can be configured in whichever way works best for you.

## Supported features (non-exhaustive list)

Note that all these features can be enabled or disabled.

* Smooth scrolling of chat messages to improve readability of a fast-flowing chat
* Fully customizable color pallette
* New messages can be set to appear at the top or the bottom of the screen
* Show or hide moderator actions
* Highlight messages based on the username or certain keyphrases
* Immediately show the images posted by users
* Load Twitter messages linked to by users
* Shorten links posted in chat
* Store settings over sessions or adjust default settings in the HTML page for portability
* Optionally show timestamps next to messages

Several more features are in [the pipeline](https://github.com/Glodenox/twitch-chat-monitor/issues)!

## How to use

### Pre-hosted on github.io

The latest version of the tool is hosted on [https://glodenox.github.io/twitch-chat-monitor/](https://glodenox.github.io/twitch-chat-monitor/) and can be used from there.

### Hosted on your own domain or locally

In order to host the tool on your own domain or locally, you just need to [download the ZIP](https://github.com/Glodenox/twitch-chat-monitor/archive/master.zip) and place the files on a server. Alternatively you can also just open the `index.html` file locally.

The project consists of 4 files:

* *index.html*: the web page you want to open in a browser to see the chat
* *main.js*: main JavaScript file
* *tmi.js*: a copy of the [tmi.js JavaScript library for Twitch](https://github.com/tmijs/tmi.js)
* *style.css*: CSS styles are stored here
