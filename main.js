var chat = document.getElementById('chat'),
	chatContainer = document.getElementById('chat-container'),
	scrollDistance = 0, // How many pixels are we currently still hiding?
	scrollReference = 0, // Distance when we started scrolling
	imageExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.webp', '.av1'],
	roomstate = {};


/** Store settings with a local cache. Storing these variables directly in localStorage would remove the variable's type information **/
var Settings = function() {
	// Clone default settings so they can be used to reset
	var settings = Object.assign({}, defaultSettings);
	// Restore previous settings
	var previousSettings = localStorage.getItem('config') !== null ? JSON.parse(localStorage.getItem('config')) : {};
	Object.assign(settings, previousSettings);
	// Store all settings as CSS variables as well
	Object.keys(settings).forEach((key) => document.body.style.setProperty('--' + key, settings[key]));

	var update = (key, value) => {
		settings[key] = value;
		localStorage.setItem('config', JSON.stringify(settings));
		document.body.style.setProperty('--' + key, value);
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

/** Set up chat client **/
var options = {
	connection: {
		secure: true,
		reconnect: true
	},
	channels: [ ensureHash(Settings.get('channel')) ]
};
var client = new tmi.client(options);
client.addListener('message', handleChat);
client.addListener('roomstate', handleRoomstate);
client.addListener('subscription', (channel, username, method, message, userstate) => handleSubscription(username, message, userstate));
client.addListener('resub', (channel, username, months, message, userstate, methods) => handleSubscription(username, message, userstate));
client.addListener('submysterygift', (channel, username, numbOfSubs, methods, userstate) => handleSubscription(username, null, userstate));
client.addListener('messagedeleted', handleMessageDeletion);
client.addListener('raided', (channel, username, viewers) => addNotice(`${username} raided the channel with ${viewers} viewers!`));
client.addListener('slowmode', (channel, enabled, length) => addNotice(`Slowmode chat has been ${enabled ? 'activated for ${length} minutes' : 'deactivated'}.`));
client.addListener('followersonly', (channel, enabled, length) => addNotice(`Followers-only chat has been ${enabled ? 'activated for ${length} minutes' : 'deactivated'}.`));
client.addListener('emoteonly', (channel, enabled) => addNotice(`Emote-only chat has been ${enabled ? 'activated' : 'deactivated'}.`));
client.addListener('clearchat', (channel) => {
	chat.innerHTML = '';
	addNotice('Chat has been cleared');
});

client.connect();


/** Interface interactions **/
document.getElementById('settings-wheel').addEventListener('click', () => document.getElementById('settings').classList.toggle('hidden'));
// Twitch
document.getElementById('settings-channel').value = Settings.get('channel');
document.getElementById('settings-channel').form.addEventListener('submit', (e) => {
	var channel = document.getElementById('settings-channel').value;
	if (channel != '') {
		client.leave(ensureHash(Settings.get('channel')));
		Settings.set('channel', channel);
		client.join(ensureHash(channel));
	}
	e.preventDefault();
});
// Style
['background-color', 'odd-background-color', 'separator-color', 'text-color', 'user-color', 'moderator-color'].forEach(key => {
	document.getElementById('settings-' + key).value = Settings.get(key);
	document.getElementById('settings-' + key).addEventListener('change', (e) => Settings.set(key, e.target.value));
});
// Chat Behavior
document.body.classList.toggle('reverse-order', !Settings.get('new-messages-on-top'));
document.getElementById('settings-new-messages-on-top').checked = Settings.get('new-messages-on-top');
document.getElementById('settings-new-messages-on-top').addEventListener('click', () => {
	Settings.toggle('new-messages-on-top');
	document.body.classList.toggle('reverse-order', !Settings.get('new-messages-on-top'));
	scrollDistance = scrollReference = 0;
	chatContainer.scrollTop = Settings.get('new-messages-on-top') ? 0 : chatContainer.scrollHeight - window.innerHeight;
});
document.getElementById('settings-smooth-scroll').checked = Settings.get('smooth-scroll');
document.getElementById('settings-smooth-scroll').addEventListener('click', () => {
	Settings.toggle('smooth-scroll');
	scrollDistance = scrollReference = 0;
	chatContainer.scrollTop = Settings.get('new-messages-on-top') ? 0 : chatContainer.scrollHeight - window.innerHeight;
	document.getElementById('settings-smooth-scroll').parentNode.nextElementSibling.classList.toggle('hidden', !Settings.get('smooth-scroll'));
});
if (Settings.get('smooth-scroll')) {
	document.getElementById('settings-smooth-scroll').parentNode.nextElementSibling.classList.remove('hidden');
}
document.getElementById('settings-smooth-scroll-duration').value = Settings.get('smooth-scroll-duration');
document.getElementById('settings-smooth-scroll-duration').addEventListener('input', (e) => {
	var duration = parseInt(e.target.value);
	if (!isNaN(duration) && e.target.validity.valid) {
		Settings.set('smooth-scroll-duration', duration);
	}
});
// Message Handling
document.getElementById('settings-format-urls').checked = Settings.get('format-urls');
document.getElementById('settings-format-urls').addEventListener('click', () => Settings.toggle('format-urls'));
document.getElementById('settings-shorten-urls').checked = Settings.get('shorten-urls');
document.getElementById('settings-shorten-urls').addEventListener('click', () => Settings.toggle('shorten-urls'));
document.getElementById('settings-inline-images').checked = Settings.get('inline-images');
document.getElementById('settings-inline-images').addEventListener('click', () => {
	Settings.toggle('inline-images');
	document.getElementById('settings-inline-images').parentNode.nextElementSibling.classList.toggle('hidden', !Settings.get('inline-images'));
});
if (Settings.get('inline-images')) {
	document.getElementById('settings-inline-images').parentNode.nextElementSibling.classList.remove('hidden');
}
document.getElementById('settings-inline-images-height').value = Settings.get('inline-images-height').slice(0, -2); // remove vh identifier
document.getElementById('settings-inline-images-height').addEventListener('input', (e) => {
	var height = parseInt(e.target.value);
	if (!isNaN(height) && e.target.validity.valid) {
		Settings.set('inline-images-height', height + 'vh');
	}
});
document.getElementById('settings-unfurl-twitter').checked = Settings.get('unfurl-twitter');
document.getElementById('settings-unfurl-twitter').addEventListener('click', () => Settings.toggle('unfurl-twitter'));

document.body.addEventListener('keydown', (e) => {
	if ((e.key == "H" || e.key == "h") && e.shiftKey && e.ctrlKey) {
		document.getElementById('curtain').classList.toggle('hidden');
	} else if ((e.key == "S" || e.key == "s") && e.shiftKey && e.ctrlKey) {
		document.getElementById('settings').classList.toggle('hidden');
	} else if ((e.key == "Escape")) {
		document.getElementById('settings').classList.add('hidden');
	}
});


// Continually scroll, in a way to make the comments readable
var lastFrame = +new Date();
function scrollUp(now) {
	if (Settings.get('smooth-scroll') && scrollDistance > 0) {
		// Estimate how far along we are in scrolling in the current scroll reference
		var currentStep = Settings.get('smooth-scroll-duration') / (now - lastFrame);
		scrollDistance -= scrollReference / currentStep;
		scrollDistance = Math.max(scrollDistance, 0);
		chatContainer.scrollTop = Math.round(Settings.get('new-messages-on-top') ? scrollDistance : chatContainer.scrollHeight - window.innerHeight - scrollDistance);
	}
	lastFrame = now;
	window.requestAnimationFrame(scrollUp);
}
window.requestAnimationFrame(scrollUp);


/** Chat event handling **/
function handleChat(channel, userstate, message, self) {
	var chatLine = createChatLine(userstate, message);

	// Deal with loading user-provided inline images
	var userImages = Array.from(chatLine.querySelectorAll('img.user-image'));
	if (userImages.length > 0) {
		userImages.filter((userImage) => !userImage.complete).forEach((userImage) => {
			userImage.style.display = 'none';
			userImage.addEventListener('load', () => {
				var oldChatLineHeight = chatLine.scrollHeight;
				userImage.style.display = 'inline';
				scrollReference = scrollDistance += Math.max(0, chatLine.scrollHeight - oldChatLineHeight);
			});
		});
	}

	// Load Twitter messages, if any
	var tweets = Array.from(chatLine.querySelectorAll('div[data-tweet]'));
	if (tweets.length > 0 && twttr && twttr.init) {
		tweets.forEach((tweet) => {
			twttr.widgets
				.createTweet(tweet.dataset.tweet, tweet, {theme: 'dark', conversation: 'none', cards: 'hidden', dnt: 'true'})
				.then(el => {
					scrollReference = scrollDistance += el.scrollHeight;
				})
				.catch(e => console.log(e));
		});
	}
	addMessage(chatLine);
}

function handleRoomstate(channel, state) {
	if (roomstate.channel != channel) {
		addNotice(`Joined ${channel}.`);
	}
	roomstate = state;
}

function handleSubscription(username, message, userstate) {
	var chatLine = document.createElement('div');
	chatLine.className = 'subscription';

	var subscriptionNotice = document.createElement('div');
	subscriptionNotice.textContent = userstate['system-msg'].replaceAll('\\s', ' ');
	chatLine.append(subscriptionNotice);

	if (message) {
		chatLine.append(createChatLine(userstate, message));
	}
	addMessage(chatLine);
}

function handleMessageDeletion(channel, username, deletedMessage, userstate) {
	var message = document.getElementById(userstate['target-msg-id']);
	if (message) {
		message.textContent = '<Message deleted>';
	}
}

function createChatLine(userstate, message) {
	var chatLine = document.createElement('div'),
		chatName = document.createElement('span'),
		chatMessage = document.createElement('span');

	// Fill chat line with content
	chatName.className = 'chat-user';
	if (userstate.mod) {
		chatName.classList.add('moderator');
	}
	chatName.textContent = userstate['display-name'] || userstate.username;
	chatMessage.innerHTML = formatMessage(message, userstate.emotes);
	chatMessage.id = userstate.id;

	chatLine.appendChild(chatName);
	chatLine.appendChild(chatMessage);

	return chatLine;
}

function addNotice(message) {
	var chatLine = document.createElement('div');
	chatLine.textContent = message;
	addMessage(chatLine);
}

function addMessage(chatLine) {
	chat.appendChild(chatLine);
	// Calculate height for smooth scrolling
	scrollReference = scrollDistance += chatLine.scrollHeight;
	if (!Settings.get('new-messages-on-top') && !Settings.get('smooth-scroll')) {
		chatContainer.scrollTop = chatContainer.scrollHeight - window.innerHeight;
	}

	// Check whether we can remove the two oldest messages
	while (chat.childNodes.length > 2 && window.innerHeight + scrollDistance < chat.scrollHeight - chat.firstChild.scrollHeight - chat.childNodes[1].scrollHeight) {
		chat.firstChild.remove();
		chat.firstChild.remove();
	}
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
				replaceText(text, '<img class="emoticon" src="https://static-cdn.jtvnw.net/emoticons/v2/' + id + '/default/dark/1.0" />', range[0], range[1]);
			}
		});
	};
	return text;
}

function formatLinks(text, originalText) {
	var urlRegex = /https?:\/\/(www\.)?([0-9a-zA-Z-_\.]+\.[0-9a-zA-Z-_]+\/)([0-9a-zA-Z-_#=\/\.\?\|]+)?/g;
	var match;
	while ((match = urlRegex.exec(originalText)) !== null) {
		var urlText = match[0];
		var path = match[3] || '';
		if (Settings.get('inline-images') && imageExtensions.some((extension) => path.endsWith(extension))) {
			var imageUrl = match[0];
			var giphy = /^https?:\/\/giphy\.com\/gifs\/(.*-)?([a-zA-Z0-9]+)$/gm.exec(urlText.textContent);
			if (giphy) {
				imageUrl = "https://media1.giphy.com/media/" + giphy[2].split("-").pop() + "/giphy.gif";
			}
			text.push('<br /><img class="user-image" src="' + imageUrl + '" alt="' + match[0] + '" />');
			replaceText(text, '', match.index, match.index + match[0].length - 1);
			continue;
		}
		if (Settings.get('unfurl-twitter') && match[2] == 'twitter.com/' && match[3] != undefined) {
			var twitter = /^https?:\/\/(www\.)?twitter\.com.+\/([0-9]+)$/gm.exec(match[0]);
			if (twitter) {
				text.push('<div data-tweet="' + twitter[2] + '"></div>');
				replaceText(text, '', match.index, match.index + match[0].length - 1);
				continue;
			}
		}
		if (Settings.get('shorten-urls')) {
			if (path.length < 25) {
				urlText = match[2] + path;
			} else {
				urlText = match[2] + ' &hellip; ';
				if (path.lastIndexOf('/') == -1) {
					urlText += path.slice(-7); // No directory structure in the URL
				} else {
					urlText += path.substring(path.lastIndexOf('/')).slice(-10); // Show last directory if it is not too long
				}
			}
		}
		var replacement = Settings.get('format-urls') ? '<a href="' + match[0] + '" target="_blank" rel="noreferrer noopener">' + urlText + '</a>' : urlText;
		replaceText(text, replacement, match.index, match.index + match[0].length - 1);
	}
	return text;
}


/** Helper functions **/
function ensureHash(text) {
	if (!text.startsWith('#')) {
		return '#' + text;
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
	return html.map((character) => {
		if (character.length == 1) {
			return character.replace(/[\u00A0-\u9999<>\&]/gim, (match) => '&#' + match.charCodeAt(0) + ';');
		}
		return character;
	});
}