var scrollDistance = 0, // How many pixels are we currently still hiding?
	scrollReference = 0, // Distance when we started scrolling
	imageExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.webp', '.av1'],
	bitLevels = [ 10000, 1000, 500, 100, 1 ],
	frames = 0,
	fpsInterval,
	lastFrameReset,
	lastMoveTimeoutId = null,
	messageQueue = [],
	delayQueue = [],
	lastMessageTimestamp = 0;


/** Store settings with a local cache. Storing these variables directly in localStorage would remove the variable's type information **/
var Settings = function() {
	var transparentBackgroundKeys = ['notice-color', 'highlight-color', 'channel-color'];
	// Clone default settings so they can be used to reset
	var settings = Object.assign({}, defaultSettings);
	// Restore previous settings
	var previousSettings = localStorage.getItem('config') !== null ? JSON.parse(localStorage.getItem('config')) : {};
	Object.assign(settings, previousSettings);
	// Store all settings as CSS variables as well
	Object.keys(settings).forEach((key) => document.body.style.setProperty('--' + key, settings[key]));
	transparentBackgroundKeys.forEach((key) => document.body.style.setProperty('--' + key.replace('-color', '-background-color'), settings[key] + '50'));

	var update = (key, value) => {
		settings[key] = value;
		localStorage.setItem('config', JSON.stringify(settings));
		document.body.style.setProperty('--' + key, value);
		// Generate transparent background color values
		if (transparentBackgroundKeys.indexOf(key) != -1) {
			document.body.style.setProperty(key.replace('-color', '-background-color'), value + '50');
		}
	};
	return {
		'get': (key) => settings[key],
		'set': update,
		'toggle': (key) => update(key, !settings[key]),
		'reset': () => {
			Object.assign(settings, defaultSettings);
			localStorage.setItem('config', JSON.stringify(defaultSettings));
		}
	}
}();

var HexCompressor = function() {
	const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ=#';
	return {
		color2string: (color) => {
			var code = '';
			var firstHalf = parseInt(color.substr(1, 3), 16);
			code += characters.charAt(Math.floor(firstHalf / 64));
			code += characters.charAt(firstHalf % 64);
			var secondHalf = parseInt(color.substr(4, 3), 16);
			code += characters.charAt(Math.floor(secondHalf / 64));
			code += characters.charAt(secondHalf % 64);
			return code;
		},
		string2color: (string) => '#' + 
			("00" + (characters.indexOf(string.charAt(0)) * 64 + characters.indexOf(string.charAt(1))).toString(16)).slice(-3) +
			("00" + (characters.indexOf(string.charAt(2)) * 64 + characters.indexOf(string.charAt(3))).toString(16)).slice(-3)
	};
}();

var Badges = function() {
	var globalBadges = {};
	var channelBadges = {};
	var loadBadges = (url, handler, timeout = 2000) => {
		fetch(url)
			.then(response => {
				if (response.ok) {
					return response.json();
				} else {
					throw new Error(`Non-ok answer received from server: ${response.status} ${response.statusText}`);
				}
			})
			.then(badgeSets => handler(badgeSets.badge_sets))
			.catch(error => {
				console.error(`Failed to retrieve badges at ${url}, attempting again in ${timeout}ms`, error);
				setTimeout(() => loadBadges(url, handler, timeout * 2), timeout);
			});
	};
	loadBadges('https://badges.twitch.tv/v1/badges/global/display?language=en', (badgeSet) => globalBadges = badgeSet);
	return {
		'lookup': (badge, version, channel) => globalBadges[badge]?.versions[version] ?? channelBadges[channel]?.[badge]?.versions[version] ?? null,
		'load' : (channel) => {
			if (channelBadges[channel] == undefined) {
				loadBadges(`https://badges.twitch.tv/v1/badges/channels/${channel}/display?language=en`, (badgeSet) => channelBadges[channel] = badgeSet);
			}
		}
	};
}();

var highlightUsers = Settings.get('highlight-users').toLowerCase().split(',').filter((user) => user != ''),
	highlightKeyphrases = Settings.get('highlight-keyphrases').toLowerCase().split(',').filter((phrase) => phrase != '');

// Object containing references to all relevant UI blocks
var ui = {
	main: {
		curtain: document.getElementById('curtain'),
		fps: document.getElementById('fps')
	},
	chat: {
		body: document.getElementById('chat'),
		container: document.getElementById('chat-container')
	},
	commands: {
		body: document.getElementById('commands'),
		settings: document.getElementById('settings-toggle'),
		fullscreen: document.getElementById('fullscreen')
	},
	messageEntry: {
		body: document.getElementById('message-entry'),
		username: document.getElementById('message-username'),
		field: document.querySelector('#message-entry .message-field')
	},
	settings: {
		body: document.getElementById('settings'),
		twitch: {
			channel: document.getElementById('settings-channel'),
			channelOverride: document.getElementById('settings-channel-override'),
			identity: {
				toggle: document.getElementById('settings-twitch-messagefield'),
				body: document.getElementById('settings-twitch-messaging'),
				username: document.getElementById('settings-twitch-username'),
				token: document.getElementById('settings-twitch-token')
			}
		},
		style: {
			custom: {
				container: document.getElementById('styles'),
				selector: document.getElementById('settings-custom-style'),
				exchange: document.getElementById('settings-custom-style-exchange'),
				field: document.getElementById('settings-custom-style-exchange-field'),
				preview: document.getElementById('style-template')
			},
			fontSize: document.getElementById('settings-font-size'),
			hideCursor: document.getElementById('settings-hide-cursor'),
			adjustTitle: document.getElementById('settings-adjust-page-title')
		},
		behaviour: {
			limitRate: {
				toggle: document.getElementById('settings-limit-message-rate'),
				body: document.getElementById('settings-limit-message-rate').parentNode.nextElementSibling,
				field: document.getElementById('settings-message-rate')
			},
			reverseOrder: document.getElementById('settings-new-messages-on-top'),
			smoothScroll: {
				body: document.getElementById('settings-smooth-scroll').parentNode.nextElementSibling,
				duration: document.getElementById('settings-smooth-scroll-duration')
			},
			chatDelay: document.getElementById('settings-chat-delay')
		},
		messageHandling: {
			inlineImages: {
				body: document.getElementById('settings-inline-images').parentNode.nextElementSibling,
				height: document.getElementById('settings-inline-images-height')
			},
			timestamps: document.getElementById('settings-timestamps'),
			highlightUsers: document.getElementById('settings-highlight-users'),
			keyPhrases: document.getElementById('settings-highlight-keyphrases')
		}
	},
	notifications: {
		chatOverload: {
			body: document.getElementById('chat-overload'),
			count: document.getElementById('chat-overload-count')
		},
		networkStatus: document.getElementById('network-status'),
		keyPhrases: document.getElementById('settings-highlight-keyphrases')
	}
};

/** Set up chat client **/
var configuration = {
	options: {
		skipMembership: true,
		skipUpdatingEmotesets: true // the API no longer exists on Kraken
	}
};
if (Settings.get('identity')) {
	configuration.identity = Settings.get('identity');
}
var client = new tmi.client(configuration);
client.on('message', handleChat);
client.on('roomstate', handleRoomstate);
client.on('subscription', (channel, username, method, message, userstate) => handleSubscription(username, message, userstate));
client.on('resub', (channel, username, months, message, userstate, methods) => handleSubscription(username, message, userstate));
client.on('submysterygift', (channel, username, numbOfSubs, methods, userstate) => handleSubscription(username, null, userstate));
client.on('cheer', handleCheer);
client.on('raided', (channel, username, viewers) => addNotice(`${username} raided the channel with ${viewers} viewers!`));
client.on('slowmode', (channel, enabled, length) => addNotice(`Slowmode chat has been ${enabled ? 'activated' : 'deactivated'}.`));
client.on('followersonly', (channel, enabled, length) => addNotice(`Followers-only chat has been ${enabled ? 'activated' : 'deactivated'}.`));
client.on('emoteonly', (channel, enabled) => addNotice(`Emote-only chat has been ${enabled ? 'activated' : 'deactivated'}.`));
client.on('hosting', (channel, target) => addNotice(`The channel is now hosting ${target}.`));
client.on('unhost', (channel) => addNotice(`The channel has stopped hosting another channel.`));
client.on('messagedeleted', handleMessageDeletion);
client.on('ban', (channel, username, reason, userstate) => handleModAction('ban', username, null, userstate));
client.on('timeout', (channel, username, reason, duration, userstate) => handleModAction('timeout', username, duration, userstate));
client.on('clearchat', (channel) => {
	ui.chat.body.textContent = '';
	addNotice('Chat has been cleared by a moderator');
});
// Network connection monitoring
client.on('disconnected', () => ui.notifications.networkStatus.classList.remove('hidden'));
client.on('connected', () => {
	if (!ui.notifications.networkStatus.classList.contains('hidden')) {
		addNotice('Connection reestablished, resuming chat monitoring.');
	}
	ui.notifications.networkStatus.classList.add('hidden');
});
client.connect().then(() => {
	let channelFromPath = (document.location.href.match(/channel=([A-Za-z0-9_]+)/) || [null])[1];
	if (channelFromPath) {
		joinChannel(channelFromPath);
		ui.settings.twitch.channelOverride.classList.remove('hidden');
	} else {
		joinChannel(Settings.get('channel'));
	}
});

/** Interface interactions **/
// Message sending
ui.messageEntry.body.addEventListener('submit', (e) => {
	let field = ui.messageEntry.field;
	if (field.value.trim().length > 0) {
		field.disabled = true;
		client.say(client.channels[0], field.value.trim()).then(() => {
			field.value = '';
			field.disabled = false;
			field.focus();
		}).catch(() => {
			field.disabled = false;
			field.focus();
		});
	}
	e.preventDefault();
});
if (document.body.classList.contains('show-message-entry')) {
	ui.messageEntry.field.focus();
}
// Settings
ui.commands.settings.addEventListener('click', () => {
	ui.settings.body.classList.toggle('hidden');
	ui.settings.body.scrollTop = 0;
	ui.commands.settings.classList.toggle('open');
});
document.querySelectorAll('.help').forEach((help) => help.addEventListener('click', () => help.classList.toggle('visible')));
// Twitch
ui.settings.twitch.channel.value = Settings.get('channel');
ui.settings.twitch.channel.addEventListener('input', (e) => e.target.value = e.target.value.replaceAll('https://www.twitch.tv/', '').replaceAll('twitch.tv/', ''));
ui.settings.twitch.channel.form.addEventListener('submit', (e) => {
	var channel = ui.settings.twitch.channel.value;
	if (channel != '' && client.channels.indexOf(ensureHash(channel)) == -1) {
		if (client.channels.length > 0) {
			client.leave(ensureHash(client.channels[0]));
		}
		// Fade out all previous channel messages before joining new one
		ui.chat.body.querySelectorAll('div').forEach((msg) => msg.style.opacity = 0.5);
		Settings.set('channel', channel);
		joinChannel(channel);
		ui.settings.twitch.channelOverride.classList.add('hidden');
	}
	e.preventDefault();
});
if (Settings.get('identity')) {
	let identity = ui.settings.twitch.identity;
	identity.username.value = Settings.get('identity').username;
	identity.token.value = Settings.get('identity').token;
	identity.body.classList.remove('disabled');
	identity.toggle.classList.remove('disabled');
	identity.toggle.disabled = false;
	ui.messageEntry.username.textContent = Settings.get('identity').username;
	document.body.classList.toggle('show-message-entry', Settings.get('twitch-messagefield'));
}
configureToggler('twitch-messagefield', () => {
	document.body.classList.toggle('show-message-entry', Settings.get('twitch-messagefield'));
	if (Settings.get('twitch-messagefield') && client.username.toLowerCase() != Settings.get('identity').username.toLowerCase()) {
			ui.messageEntry.username.textContent = Settings.get('identity').username;
			client.disconnect();
			client.opts.identity = Settings.get('identity');
			client.opts.username = Settings.get('identity').username;
			client.connect();
	}
});
ui.settings.twitch.identity.username.addEventListener('input', (e) => {
	let identity = ui.settings.twitch.identity;
	if (e.target.value.length > 0 && identity.token.value.length > 0 && identity.token.validity.valid) {
		Settings.set('identity', {
			'username': identity.username.value,
			'password': identity.token.value
		});
		identity.body.classList.remove('disabled');
		identity.toggle.disabled = false;
	} else {
		identity.body.classList.add('disabled');
		identity.toggle.disabled = false;
		identity.toggle.checked = false;
		document.body.classList.remove('show-message-entry');
		Settings.set('twitch-messagefield', false);
		Settings.set('identity', null);
		if (!client.username.startsWith('justinfan')) { // already logged out
			identity.username.textContent = '';
			client.disconnect();
			client.opts.identity = {};
			delete client.opts.username;
			client.connect();
		}
	}
});
ui.settings.twitch.identity.token.addEventListener('input', (e) => {
	let identity = ui.settings.twitch.identity;
	if (!/^oauth:[0-9a-z]{30}$/.test(e.target.value)) {
		e.target.setCustomValidity('Invalid token');
		e.target.reportValidity();
		identity.body.classList.add('disabled');
		identity.toggle.disabled = true;
		identity.toggle.checked = false;
		document.body.classList.remove('show-message-entry');
		Settings.set('twitch-messagefield', false);
		Settings.set('identity', null);
		if (!client.username.startsWith('justinfan')) { // already logged out
			identity.username.textContent = '';
			client.disconnect();
			client.opts.identity = {};
			delete client.opts.username;
			client.connect();
		}
		return;
	}
	e.target.setCustomValidity('');
	if (identity.username.value.length > 0) {
		Settings.set('identity', {
			'username': identity.username.value,
			'password': identity.token.value
		});
		identity.body.classList.remove('disabled');
		identity.toggle.disabled = false;
	}
});
// Style
if (Settings.get('show-command-buttons')) {
	ui.commands.body.classList.remove('hidden');
}
if (document.fullscreenEnabled && Settings.get('support-fullscreen')) {
	ui.commands.fullscreen.addEventListener('click', () => {
		if (document.fullscreenElement) {
			document.exitFullscreen()
		} else {
			document.documentElement.requestFullscreen();
		}
	});
} else {
	ui.commands.fullscreen.classList.add('hidden');
}
[
	{
		'name': "default",
		'background': "#000000",
		'odd-background': "#111111",
		'separator': "#444444",
		'text': "#eeeeee",
		'user': "#008000",
		'moderator': "#8383f9",
		'channel': "#0d86ff",
		'notice': "#eeeeee",
		'highlight': "#731180"
	}, {
		'name': "bright",
		'background': "#eeeeee",
		'odd-background': "#dddddd",
		'separator': "#bbbbbb",
		'text': "#111111",
		'user': "#00b000",
		'moderator': "#8383f9",
		'channel': "#0d86ff",
		'notice': "#111111",
		'highlight': "#731180"
	}, {
		'name': 'LRR',
		'background': "#202020",
		'odd-background': "#111111",
		'separator': "#464646",
		'text': "#d2d2d2",
		'user': "#5282ff",
		'moderator': "#f15a24",
		'channel': "#f15a24",
		'notice': "#d2d2d2",
		'highlight': "#e1480f"
	}
].forEach(createStylePreview);
var colorFields = ['background', 'odd-background', 'separator', 'text', 'user', 'moderator', 'channel', 'notice', 'highlight'];
var customStyleValues = {
	'name': "custom"
};
colorFields.forEach(key => customStyleValues[key] = Settings.get(`${key}-color`));
var customStylePreview = createStylePreview(customStyleValues, true);
colorFields.forEach(key => {
	document.getElementById(`settings-${key}-color`).value = Settings.get(`${key}-color`);
	document.getElementById(`settings-${key}-color`).addEventListener('change', (e) => {
		Settings.set(`${key}-color`, e.target.value);
		customStylePreview.style.setProperty(`--style-${key}`, e.target.value);
		if (['channel', 'notice', 'highlight'].indexOf(key) != -1) {
			customStylePreview.style.setProperty(`--style-${key}-background`, e.target.value + '50');
		}
		updateImportExport();
	});
});
updateImportExport();
ui.settings.style.custom.field.addEventListener('input', (e) => {
	if (!/^[0-9a-zA-Z+#]{36}$/.test(e.target.value)) {
		e.target.setCustomValidity('Invalid code');
		e.target.reportValidity();
		return;
	}
	e.target.setCustomValidity('');
	colorFields.forEach((key, index) => {
		var newColor = HexCompressor.string2color(e.target.value.substr(index * 4, 4));
		Settings.set(key + '-color', newColor);
		document.getElementById('settings-' + key + '-color').value = newColor;
	});
});
ui.settings.style.custom.selector.classList.toggle('hidden', Settings.get('style-preset') != 'custom');
ui.settings.style.custom.exchange.classList.toggle('hidden', Settings.get('style-preset') != 'custom');

ui.settings.style.fontSize.value = Settings.get('font-size').slice(0, -2); // remove pixel unit
ui.settings.style.fontSize.addEventListener('change', (e) => Settings.set('font-size', e.target.value + 'px'));

document.body.classList.toggle('hide-cursor', Settings.get('hide-cursor'));
ui.settings.style.hideCursor.checked = Settings.get('hide-cursor');
configureToggler('hide-cursor', () => document.body.classList.toggle('hide-cursor', Settings.get('hide-cursor')));
document.addEventListener('mousemove', () => {
	if (Settings.get('hide-cursor')) {
		document.body.classList.remove('hide-cursor');
		clearTimeout(lastMoveTimeoutId);
		lastMoveTimeoutId = setTimeout(() => Settings.get('hide-cursor') && document.body.classList.add('hide-cursor'), 4000);
	}
});

ui.settings.style.adjustTitle.checked = Settings.get('adjust-page-title');
configureToggler('adjust-page-title', () => {
	if (!Settings.get('adjust-page-title')) {
		document.title = 'Chat Monitor';
	} else {
		document.title = ensureHash(Settings.get('channel')) + ' - Chat Monitor';
	}
});

// Chat Behavior
document.body.classList.toggle('limit-message-rate', !Settings.get('limit-message-rate'));
ui.settings.behaviour.limitRate.toggle.checked = Settings.get('limit-message-rate');
configureToggler('limit-message-rate', () => {
	document.body.classList.toggle('limit-message-rate', !Settings.get('limit-message-rate'));
	ui.settings.behaviour.limitRate.body.classList.toggle('hidden', !Settings.get('limit-message-rate'));
	if (!Settings.get('limit-message-rate')) {
		flushMessageQueue();
		ui.notifications.chatOverload.body.classList.add('hidden');
	}
});
if (Settings.get('limit-message-rate')) {
	ui.settings.behaviour.limitRate.body.classList.remove('hidden');
}
ui.settings.behaviour.limitRate.field.value = Settings.get('message-rate');
ui.settings.behaviour.limitRate.field.addEventListener('input', (e) => {
	var rate = parseInt(e.target.value);
	if (!isNaN(rate) && e.target.validity.valid) {
		Settings.set('message-rate', rate);
	}
});
document.body.classList.toggle('reverse-order', !Settings.get('new-messages-on-top'));
configureToggler('new-messages-on-top', () => {
	document.body.classList.toggle('reverse-order', !Settings.get('new-messages-on-top'));
	scrollDistance = scrollReference = 0;
	ui.chat.container.scrollTop = Settings.get('new-messages-on-top') ? 0 : ui.chat.container.scrollHeight - window.innerHeight;
});
configureToggler('smooth-scroll', () => {
	scrollDistance = scrollReference = 0;
	ui.chat.container.scrollTop = Settings.get('new-messages-on-top') ? 0 : ui.chat.container.scrollHeight - window.innerHeight;
	ui.settings.behaviour.smoothScroll.body.classList.toggle('hidden', !Settings.get('smooth-scroll'));
});
if (Settings.get('smooth-scroll')) {
	ui.settings.behaviour.smoothScroll.body.classList.remove('hidden');
}
ui.settings.behaviour.smoothScroll.duration.value = Settings.get('smooth-scroll-duration');
ui.settings.behaviour.smoothScroll.duration.addEventListener('input', (e) => {
	var duration = parseInt(e.target.value);
	if (!isNaN(duration) && e.target.validity.valid) {
		Settings.set('smooth-scroll-duration', duration);
	}
});

ui.settings.behaviour.chatDelay.value = Settings.get('chat-delay');
ui.settings.behaviour.chatDelay.addEventListener('change', (e) => setChatDelay(e.target.value));

// Message Handling
ui.chat.body.classList.toggle('align-messages', Settings.get('align-messages'));
configureToggler('align-messages', () => ui.chat.body.classList.toggle('align-messages', Settings.get('align-messages')));
ui.chat.body.classList.toggle('show-badges', Settings.get('show-badges'));
configureToggler('show-badges', () => ui.chat.body.classList.toggle('show-badges', Settings.get('show-badges')));
['combine-messages', 'format-urls', 'shorten-urls', 'unfurl-youtube', 'show-subscriptions', 'show-bits', 'show-mod-actions'].forEach(configureToggler);
configureToggler('inline-images', () => ui.settings.messageHandling.inlineImages.body.classList.toggle('hidden', !Settings.get('inline-images')));
if (Settings.get('inline-images')) {
	ui.settings.messageHandling.inlineImages.body.classList.remove('hidden');
}
ui.settings.messageHandling.inlineImages.height.value = Settings.get('inline-images-height').slice(0, -2); // remove vh unit
ui.settings.messageHandling.inlineImages.height.addEventListener('input', (e) => {
	var height = parseInt(e.target.value);
	if (!isNaN(height) && e.target.validity.valid) {
		Settings.set('inline-images-height', height + 'vh');
	}
});
configureToggler('unfurl-twitter', () => {
	if (typeof twttr == 'undefined') {
		var twitterScript = document.createElement('script');
		twitterScript.src = 'https://platform.twitter.com/widgets.js';
		document.body.appendChild(twitterScript);
	}
});
if (Settings.get('unfurl-twitter')) {
	var twitterScript = document.createElement('script');
	twitterScript.src = 'https://platform.twitter.com/widgets.js';
	document.body.appendChild(twitterScript);
}
ui.settings.messageHandling.timestamps.value = Settings.get('timestamps');
ui.chat.body.classList.toggle('hide-timestamps', Settings.get('timestamps') == '');
ui.settings.messageHandling.timestamps.addEventListener('change', (e) => {
	Settings.set('timestamps', e.target.value);
	ui.chat.body.classList.toggle('hide-timestamps', e.target.value == '');
	Array.from(ui.chat.body.querySelectorAll('.timestamp')).forEach(updateTimestamp);
});
ui.settings.messageHandling.highlightUsers.value = Settings.get('highlight-users');
ui.settings.messageHandling.highlightUsers.addEventListener('input', (e) => {
	Settings.set('highlight-users', e.target.value.toLowerCase());
	highlightUsers = e.target.value.toLowerCase().split(',').filter((user) => user != '');
});
ui.settings.messageHandling.keyPhrases.value = Settings.get('highlight-keyphrases');
ui.settings.messageHandling.keyPhrases.addEventListener('input', (e) => {
	Settings.set('highlight-keyphrases', e.target.value.toLowerCase());
	highlightKeyphrases = e.target.value.toLowerCase().split(',').filter((phrase) => phrase != '');
});
configureToggler('show-fps', (e) => handleFPS(e.target.checked));
if (Settings.get('show-fps')) {
	handleFPS(true);
}

// Hotkeys
document.body.addEventListener('keydown', (e) => {
	if (!Settings.get('support-hotkeys')) {
		return;
	}
	if ((e.key == 'H' || e.key == 'h') && e.shiftKey && e.ctrlKey) {
		ui.main.curtain.classList.toggle('hidden');
		e.preventDefault();
	} else if ((e.key == 'S' || e.key == 's') && e.shiftKey && e.ctrlKey) {
		ui.settings.body.classList.toggle('hidden');
		ui.settings.body.scrollTop = 0;
		ui.commands.settings.classList.toggle('open');
		e.preventDefault();
	} else if ((e.key == 'Escape')) {
		ui.settings.body.classList.add('hidden');
		ui.commands.settings.classList.remove('open');
		e.preventDefault();
	}
});

function joinChannel(channel) {
	client.join(ensureHash(channel)).then(() => {
		console.log('Joined channel ' + channel);
		if (Settings.get('adjust-page-title')) {
			document.title = ensureHash(channel) + ' - Chat Monitor';
		}
	}, (error) => {
		addNotice(`Failed to join requested channel. Reason: ${decodeMessageId(error)}`);
		console.error('Failed to join requested channel', error);
		if (Settings.get('adjust-page-title')) {
			document.title = 'Chat Monitor';
		}
	});
}

// Decode a Message ID returned by the Twitch API to a human-readable message
function decodeMessageId(messageId) {
	let knownMessages = {
		'msg_banned': 'You are permanently banned from talking in this channel.',
		'msg_channel_blocked': 'Your account is not in good standing in this channel.',
		'msg_channel_suspended': 'This channel does not exist or has been suspended.',
		'msg_requires_verified_phone_number': 'A verified phone number is required to chat in this channel. Please visit https://www.twitch.tv/settings/security to verify your phone number.',
		'msg_suspended': 'You don\'t have permission to perform that action.',
		'msg_verified_email': 'This room requires a verified account to chat. Please verify your account at https://www.twitch.tv/settings/security.'
	};
	return knownMessages[messageId] || messageId;
}

// Process the next frame, this is the main driver of the application
var lastFrame = +new Date();
function step(now) {
	if (Settings.get('show-fps')) {
		frames++;
	}
	if (Settings.get('chat-delay') != 0) {
		while (delayQueue.length > 0 && parseInt(delayQueue[0].dataset.timestamp) + (Settings.get('chat-delay') * 1000) < Date.now()) {
			addMessage(delayQueue.shift(), true);
		}
	}
	if (Settings.get('limit-message-rate')) {
		if (messageQueue.length > 40) {
			ui.notifications.chatOverload.body.classList.remove('hidden');
			// Cull the queue to a reasonable length and update the counter
			ui.notifications.chatOverload.count.textContent = parseInt(ui.notifications.chatOverload.count.textContent) + messageQueue.splice(-40).length;
		}
		if (messageQueue.length < 10 && !ui.notifications.chatOverload.body.classList.contains('hidden')) {
			ui.notifications.chatOverload.body.classList.add('hidden');
			ui.notifications.chatOverload.count.textContent = "0";
		}
		if (messageQueue.length > 0 && now - lastMessageTimestamp > 1000 / Settings.get('message-rate')) {
			processChat.apply(this, messageQueue.shift());
			lastMessageTimestamp = now;
		}
	}
	if (Settings.get('smooth-scroll') && scrollDistance > 0) {
		// Estimate how far along we are in scrolling in the current scroll reference
		var currentStep = Settings.get('smooth-scroll-duration') / (now - lastFrame);
		scrollDistance -= scrollReference / currentStep;
		scrollDistance = Math.max(scrollDistance, 0);
		ui.chat.container.scrollTop = Math.round(Settings.get('new-messages-on-top') ? scrollDistance : ui.chat.container.scrollHeight - window.innerHeight - scrollDistance);
	}
	lastFrame = now;
	window.requestAnimationFrame(step);
}
window.requestAnimationFrame(step);

/** Chat event handling **/
function handleChat(channel, userstate, message) {
	if (Settings.get('limit-message-rate')) {
		messageQueue.push([ channel, userstate, message ]);
	} else {
		processChat(channel, userstate, message);
	}
}

function processChat(channel, userstate, message) {
	try {
		// If enabled, combine messages instead of adding a new message
		var id = 'message-' + message.toLowerCase().replace(/[^\p{Letter}]/gu, '');
		if (Settings.get('combine-messages') && document.getElementById(id)) {
			var matchedMessage = document.getElementById(id);
			if (!matchedMessage.counter) {
				var counterContainer = document.createElement('span'),
					counter = document.createElement('span');
				counterContainer.className = 'counter';
				counterContainer.innerHTML = '&times; ';
				counterContainer.appendChild(counter);
				counter.textContent = '1';
				matchedMessage.appendChild(counterContainer);
				matchedMessage.counter = counter;
			}
			ui.chat.body.appendChild(matchedMessage);
			matchedMessage.querySelector('.counter').classList.add('bump');
			matchedMessage.counter.textContent++;
			setTimeout(() => matchedMessage.querySelector('.counter').classList.remove('bump'), 150);
			return;
		}
		var chatLine = createChatLine(userstate, message);
		if (Settings.get('combine-messages')) {
			chatLine.id = id;
		}

		// Deal with loading user-provided inline images
		var userImages = Array.from(chatLine.querySelectorAll('img.user-image'));
		if (userImages.length > 0) {
			userImages.forEach((userImage) => {
				if (userImage.complete) { // most likely it was already cached
					userImage.classList.add('loaded');
					return;
				}
				userImage.addEventListener('load', () => {
					if (userImage.dataset.mq && userImage.naturalWidth == 120) { // Failed to load, placeholder received
						if (userImage.dataset.hq) {
							userImage.src = userImage.dataset.hq;
							userImage.dataset.hq = '';
							return;
						} else if (userImage.dataset.mq) {
							userImage.src = userImage.dataset.mq;
							userImage.dataset.mq = '';
							return;
						}
					}
					var oldChatLineHeight = chatLine.scrollHeight;
					userImage.classList.add('loaded');
					var loadingText = chatLine.querySelector('.image-loading');
					if (chatLine.querySelector('.user-image:not(.loaded)') == null && loadingText != null) {
						loadingText.remove();
					}
					scrollReference = scrollDistance += Math.max(0, chatLine.scrollHeight - oldChatLineHeight);
				});
				userImage.addEventListener('error', () => {
					var loadingText = chatLine.querySelector('.image-loading');
					if (loadingText) {
						loadingText.textContent = '[image loading failed]';
					}
				});
			});
			if (userImages.some(image => !image.complete)) {
				var loadingText = document.createElement('span');
				loadingText.className = 'image-loading';
				loadingText.textContent = '[Loading image...]';
				var firstBreakLine = chatLine.querySelector('br');
				firstBreakLine.insertAdjacentText('beforebegin', ' ');
				firstBreakLine.insertAdjacentElement('beforebegin', loadingText);
			}
		}

		// Load Twitter messages, if any
		var tweets = Array.from(chatLine.querySelectorAll('div.tweet-embed'));
		if (tweets.length > 0 && typeof twttr != 'undefined' && twttr.init) {
			tweets.forEach((tweet) => {
				twttr.widgets
					.createTweet(tweet.dataset.tweet, tweet, {
						theme: 'dark',
						conversation: 'none',
						cards: 'hidden',
						dnt: 'true'
					})
					.then(el => {
						scrollReference = scrollDistance += el.scrollHeight;
					})
					.catch(e => console.log(e));
			});
		}
		addMessage(chatLine);
		// Check whether the message we just added was a message that was already deleted
		if (userstate.deleted) {
			deleteMessage(userstate.id);
		}
	} catch (error) {
		console.error('Error parsing chat message: ' + message, error);
	}
}

function handleRoomstate(channel, state) {
	Badges.load(state['room-id']);
	flushDelayQueue();
	flushMessageQueue();
	addNotice(`Joined ${channel}.`);
	if (state.slow) {
		addNotice(`Channel is in slow mode.`);
	}
	if (state['followers-only'] != -1) {
		addNotice(`Channel is in followers-only mode.`);
	}
	if (state['emote-only']) {
		addNotice(`Channel is in emote-only mode.`);
	}
	if (Settings.get('chat-delay') != 0) {
		addNotice(`Chat is set to an artificial delay of ${Settings.get('chat-delay')} second${Settings.get('chat-delay') == 1 ? '' : 's'}.`);
	}
}

function handleSubscription(username, message, userstate) {
	if (!Settings.get('show-subscriptions')) {
		return;
	}
	var chatLine = document.createElement('div');
	chatLine.className = 'highlight subscription';

	var subscriptionNotice = document.createElement('div');
	subscriptionNotice.textContent = userstate['system-msg'].replaceAll('\\s', ' ');
	chatLine.append(subscriptionNotice);

	if (message && message.length > 0) {
		chatLine.append(createChatLine(userstate, message));
	}
	addMessage(chatLine);
}

function handleCheer(channel, userstate, message) {
	// We could consider to transform the cheer emotes in the message instead of removing them (https://dev.twitch.tv/docs/irc/tags/#privmsg-twitch-tags)
	var chatMessage = message;
	bitLevels.forEach((level) => chatMessage = chatMessage.replaceAll(new RegExp(`\\b[a-zA-Z]+${level}\\b`, 'g'), ''));
	var chatLine = createChatLine(userstate, chatMessage),
		cheer = document.createElement('span'),
		bitLevel = bitLevels.find((level) => parseInt(userstate.bits) >= level),
		cheerIcon = document.createElement('img');

	if (Settings.get('show-bits')) {
		if (bitLevel == undefined) {
			console.warn(`Could not parse bits received from ${userstate.username}`, userstate.bits);
			return;
		}
		cheerIcon.src = `https://static-cdn.jtvnw.net/bits/dark/animated/${bitLevel}/1.5.gif`;
		cheerIcon.alt = 'Bits';
		cheer.appendChild(cheerIcon);
		cheer.className = `cheer cheer-${bitLevel}`;
		cheer.appendChild(document.createTextNode(userstate.bits));
		chatLine.insertBefore(cheer, chatLine.lastChild);
	}
	addMessage(chatLine);
}

function handleMessageDeletion(channel, username, deletedMessage, userstate) {
	deleteMessage(userstate['target-msg-id']);
}

function handleModAction(action, username, duration, userstate) {
	if (Settings.get('show-mod-actions')) {
		if (action == 'timeout') {
			addNotice(`${username} was given a time-out of ${duration} second${duration == 1 ? '' : 's'}.`);
		} else if (action == 'ban') {
			addNotice(`${username} has been banned.`);
		}
	}
	Array.from(ui.chat.body.querySelectorAll(`span[data-user="${userstate["target-user-id"]}"]`)).map(message => message.id).forEach(deleteMessage);
}

function handleFPS(enable) {
	ui.main.fps.innerHTML = '&nbsp;';
	ui.main.fps.classList.toggle('hidden', !enable);
	lastFrameReset = Date.now();
	frames = 0;
	if (enable) {
		fpsInterval = setInterval(updateFPS, 1000);
	} else {
		clearInterval(fpsInterval);
	}
}

function updateFPS() {
	var currentFrameTime = Date.now();
	ui.main.fps.textContent = (frames / (currentFrameTime - lastFrameReset) * 1000).toFixed(1);
	lastFrameReset = currentFrameTime;
	frames = 0;
}


/** Helper functions **/
function configureToggler(key, callback) {
	document.getElementById(`settings-${key}`).checked = Settings.get(key);
	document.getElementById(`settings-${key}`).addEventListener('click', (e) => {
		Settings.toggle(key);
		if (typeof callback == 'function') {
			callback(e);
		}
	});
}

function createChatLine(userstate, message) {
	// <div><span class="timestamp">$timestamp</span><span class="chat-user moderator">$username</span><span id="$msg-id">$message</span></div>
	var chatLine = document.createElement('div'),
		chatTimestamp = document.createElement('span'),
		chatName = document.createElement('span'),
		chatBadges = document.createElement('span'),
		chatMessage = document.createElement('span');

	chatTimestamp.className = 'timestamp';
	chatTimestamp.dataset.timestamp = userstate['tmi-sent-ts'] || Date.now();
	updateTimestamp(chatTimestamp);
	chatLine.appendChild(chatTimestamp);
	chatBadges.className = 'badges';
	Object.entries(userstate.badges ?? {}).forEach(([badge, version]) => {
		var badgeData = Badges.lookup(badge, version, userstate['room-id']);
		if (badgeData) {
			var badge = document.createElement('img');
			badge.src = badgeData.image_url_1x;
			badge.srcset = `${badgeData.image_url_1x} 1x, ${badgeData.image_url_2x} 2x, ${badgeData.image_url_4x} 4x`;
			badge.title = badgeData.title;
			chatBadges.appendChild(badge);
		}
	});
	chatLine.appendChild(chatBadges);
	chatName.className = 'chat-user';
	if (userstate.mod) {
		chatName.classList.add('moderator');
	}
	if (userstate['message-type'] == 'action') {
		chatName.classList.add('action');
	}
	chatName.textContent = userstate['display-name'] || userstate.username;
	if (chatName.textContent.toLowerCase() == removeHash(client.channels[0]).toLowerCase()) {
		chatLine.className = 'highlight channel';
	}
	chatMessage.innerHTML = formatMessage(message, userstate.emotes);
	chatMessage.id = userstate.id;
	if (userstate['user-id']) {
		chatMessage.dataset.user = userstate['user-id'];
	}

	if (highlightUsers.indexOf(chatName.textContent.toLowerCase()) != -1) {
		chatLine.className = 'highlight';
	}
	if (highlightKeyphrases.find((phrase) => message.toLowerCase().indexOf(phrase) != -1)) {
		chatLine.className = 'highlight';
	}

	chatLine.appendChild(chatName);
	chatLine.appendChild(chatMessage);

	return chatLine;
}

function addNotice(message) {
	var chatLine = document.createElement('div');
	chatLine.textContent = message;
	chatLine.className = 'notice';
	addMessage(chatLine);
}

function addMessage(chatLine, bypass) {
	if (chatLine.className != 'notice' && !bypass && Settings.get('chat-delay') != 0) {
		chatLine.dataset.timestamp = Date.now();
		delayQueue.push(chatLine);
		return;
	}
	ui.chat.body.appendChild(chatLine);
	// Calculate height for smooth scrolling
	scrollReference = scrollDistance += chatLine.scrollHeight;
	if (!Settings.get('new-messages-on-top') && !Settings.get('smooth-scroll')) {
		ui.chat.container.scrollTop = ui.chat.container.scrollHeight - window.innerHeight;
	}

	// Check whether we can remove some of the oldest messages
	while (chat.childNodes.length > 2 && ui.chat.body.scrollHeight - (window.innerHeight + (Settings.get('smooth-scroll') ? scrollDistance : 0)) > ui.chat.body.firstChild.scrollHeight + ui.chat.body.childNodes[1].scrollHeight) {
		// Always remove two elements at the same time to prevent switching the odd and even rows
		ui.chat.body.firstChild.remove();
		ui.chat.body.firstChild.remove();
	}
}

function deleteMessage(messageId) {
	var message = document.getElementById(messageId);
	if (message == null) {
		var messageToDelete = messageQueue.find(entry => entry[1].id == messageId);
		if (messageToDelete) {
			messageToDelete[2] = '<Message deleted>'; // Text will be replaced, but just intended to put it back on one line
			messageToDelete[1].deleted = true;
		}
		return;
	}
	if (message.classList.contains('deleted')) { // Weird, but ok
		return;
	}
	message.parentNode.style.height = (message.parentNode.scrollHeight - 7) + 'px'; // 2 x 3px padding + 1px border = 7
	message.textContent = '<Message deleted>';
	message.classList.add('deleted');
}

/*
To deal with message formatting, the message gets turned into an array of characters first.
Twitch provides the IDs of the emotes and from where to where they are located in the message.
We replace those emote-related characters with empty strings and place an <img> tag as a string at the 'from' location.
Other changes take place in a similar way, by calculating the 'from' and 'to' values ourselves.
As a last step, all entries in the array with 1 character are transformed into HTML entities if they are potentially dangerous.
At the end, we join() the character array again, forming a message safe to assign to the innerHTML property.
*/
function formatMessage(text, emotes) {
	var message = text.split('');
	message = formatEmotes(message, emotes);
	message = formatLinks(message, text);
	return htmlEntities(message).join('');
}

function formatEmotes(text, emotes) {
	if (!emotes) {
		return text;
	}
	for (var id in emotes) {
		emotes[id].forEach((range) => {
			if (typeof range == 'string') {
				range = range.split('-').map(index => parseInt(index));
				var emote = text.slice(range[0], range[1] + 1).join('');
				replaceText(text, `<img class="emoticon" src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0" srcset="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0 1x,https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0 2x,https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0 4x" alt="${emote}" title="${emote}" />`, range[0], range[1]);
			}
		});
	};
	return text;
}

function formatLinks(text, originalText) {
	var urlRegex = /(https?:\/\/)?(www\.)?([0-9a-zA-Z-_\.]+\.[0-9a-zA-Z]+\/)([0-9a-zA-Z-_+:;,|`%^\(\)\[\]#=&\/\.\?\|\~]*[0-9a-zA-Z-_+:;|`%^\(\)\[\]#=&\/\.\?\|\~])?/g;
	var match;
	while ((match = urlRegex.exec(originalText)) !== null) {
		var urlText = url = match[0];
		if (!match[1]) {
			url = 'https://' + url;
		}
		var path = match[4] || '';
		if (Settings.get('inline-images')) {
			var giphy = /^https?:\/\/giphy\.com\/gifs\/(.*-)?([a-zA-Z0-9]+)$/gm.exec(urlText);
			if (giphy) {
				url = `https://media1.giphy.com/media/${giphy[2].split("-").pop()}/giphy.gif`;
				path = `media/${giphy[2].split("-").pop()}/giphy.gif`;
			}
			var imgur = /^https?:\/\/imgur\.com\/([a-zA-Z0-9]+)$/gm.exec(urlText);
			if (imgur) {
				url = `https://i.imgur.com/${imgur[1]}.gif`;
				path = `${imgur[1]}.gif`;
			}
			var twimg = /^https?:\/\/pbs\.twimg\.com\/media\/([a-zA-Z0-9]+)\?format=([a-z]+).*$/gm.exec(urlText);
			if (twimg) {
				url = `https://pbs.twimg.com/media/${twimg[1]}.${twimg[2]}`;
				path = `/media/${twimg[1]}.${twimg[2]}`;
			}
			if (match[1] && imageExtensions.some((extension) => path.endsWith(extension))) {
				if (text.indexOf('<br />') == -1) {
					text.push('<br />');
				}
				text.push(`<img class="user-image" src="${url}" alt="" />`);
			}
		}
		if (Settings.get('unfurl-youtube') && (match[3] == 'youtube.com/' || match[3] == 'youtu.be/')) {
			var youtube = /^https?:\/\/(www\.)?(youtu\.be\/|youtube\.com\/watch\?v=)([^&?]+).*$/gm.exec(url);
			if (youtube) {
				if (text.indexOf('<br />') == -1) {
					text.push('<br />');
				}
				text.push(`<img src="https://img.youtube.com/vi/${youtube[3]}/maxresdefault.jpg" class="user-image" alt="YouTube video preview" data-hq="https://img.youtube.com/vi/${youtube[3]}/hqdefault.jpg" data-mq="https://img.youtube.com/vi/${youtube[3]}/mqdefault.jpg" />`);
			}
		}
		if (Settings.get('unfurl-twitter') && match[3] == 'twitter.com/' && match[4] != undefined) {
			var twitter = /^https?:\/\/(www\.)?twitter\.com.+\/([0-9]+)$/gm.exec(match[0]);
			if (twitter) {
				if (text.indexOf('<br />') == -1) {
					text.push('<br />');
				}
				text.push(`<div data-tweet="${twitter[2]}" class="tweet-embed"></div>`);
			}
		}
		if (Settings.get('shorten-urls')) {
			if (path.length < 25) {
				urlText = match[3] + path;
			} else {
				urlText = match[3] + ' &hellip; ';
				if (path.lastIndexOf('/') == -1) {
					urlText += path.slice(-7); // No directory structure in the URL
				} else {
					urlText += path.substring(path.lastIndexOf('/')).slice(-10); // Show last directory if it is not too long
				}
			}
		}
		var replacement = Settings.get('format-urls') ? `<a href="${url}" target="_blank" rel="noreferrer noopener">${urlText}</a>` : urlText;
		replaceText(text, replacement, match.index, match.index + match[0].length - 1);
	}
	return text;
}

function flushMessageQueue() {
	messageQueue.forEach((args) => processChat.apply(this, args));
	messageQueue = [];
}

function flushDelayQueue() {
	delayQueue.forEach((chatLine) => addMessage(chatLine, true));
	delayQueue = [];
}

function createStylePreview(style) {
	var styleContainer = document.createElement('div');
	styleContainer.className = 'style-preview';
	var stylePreview = ui.settings.style.custom.preview.cloneNode(true);
	stylePreview.removeAttribute('id');
	stylePreview.classList.remove('hidden');
	if (style.name == Settings.get('style-preset')) {
		styleContainer.classList.add('active');
		Object.keys(style).filter(key => key != 'name').forEach(key => {
			document.body.style.setProperty(`--${key}-color`, (style.name == 'custom' ? Settings.get(`${key}-color`) : style[key]));
			if (['channel', 'notice', 'highlight'].indexOf(key) != -1) {
				document.body.style.setProperty(`--${key}-background-color`, (style.name == 'custom' ? Settings.get(`${key}-color`) : style[key]) + '50');
			}
		});
	}
	styleContainer.addEventListener('click', () => {
		Array.from(ui.settings.style.custom.container.querySelectorAll('.style-preview')).forEach(preview => preview.classList.remove('active'));
		styleContainer.classList.add('active');
		Settings.set('style-preset', style.name);
		ui.settings.style.custom.selector.classList.toggle('hidden', style.name != 'custom');
		ui.settings.style.custom.exchange.classList.toggle('hidden', style.name != 'custom');
		Object.keys(style).filter(key => key != 'name').forEach(key => {
			document.body.style.setProperty(`--${key}-color`, (style.name == 'custom' ? Settings.get(`${key}-color`) : style[key]));
			if (['channel', 'notice', 'highlight'].indexOf(key) != -1) {
				document.body.style.setProperty(`--${key}-background-color`, (style.name == 'custom' ? Settings.get(`${key}-color`) : style[key]) + '50');
			}
		});
	});
	Object.keys(style).forEach(key => stylePreview.style.setProperty(`--style-${key}`, style[key]));
	['channel', 'notice', 'highlight'].forEach(key => stylePreview.style.setProperty(`--style-${key}-background`, style[key] + '50'));
	styleContainer.textContent = style.name;
	styleContainer.appendChild(stylePreview);
	ui.settings.style.custom.container.appendChild(styleContainer);
	return stylePreview;
}

function updateTimestamp(field) {
	var formats = {
		'short24': (now) => (new Date(now)).toLocaleTimeString('en-GB').replace(/:\d\d$/, ''),
		'long24': (now) => (new Date(now)).toLocaleTimeString('en-GB'),
		'short12': (now) => (new Date(now)).toLocaleTimeString('en-US').replace(/:\d\d /, ' ').replace(/^(\d):/, '0$1:'),
		'long12': (now) => (new Date(now)).toLocaleTimeString('en-US').replace(/^(\d):/, '0$1:'),
		'short': (now) => (new Date(now)).toLocaleTimeString('en-GB').replace(/^\d\d:/, ''),
		'': () => {}
	};
	field.textContent = formats[Settings.get('timestamps')](parseInt(field.dataset.timestamp));
}

function setChatDelay(delay) {
	Settings.set('chat-delay', delay);
	addNotice(`Artificial chat delay set to ${delay} second${delay == 1 ? '' : 's'}`);
	if (delay == 0) {
		flushDelayQueue();
	}
}

function updateImportExport() {
	var code = '';
	colorFields.forEach(key => code += HexCompressor.color2string(Settings.get(key + '-color')));
	ui.settings.style.custom.field.value = code;
}

function ensureHash(text) {
	if (!text.startsWith('#')) {
		return '#' + text;
	}
	return text;
}

function removeHash(text) {
	if (text.startsWith('#')) {
		return text.substring(1);
	}
	return text;
}

function replaceText(text, replacement, from, to) {
	for (var i = from + 1; i <= to; i++) {
		text[i] = '';
	}
	text.splice(from, 1, replacement);
}

function htmlEntities(html) {
	const entityRegex = /[\u00A0-\u9999<>\&]/gim;
	return html.map((character) => {
		if (character.length == 1) {
			return character.replace(entityRegex, (match) => '&#' + match.charCodeAt(0) + ';');
		}
		return character;
	});
}
