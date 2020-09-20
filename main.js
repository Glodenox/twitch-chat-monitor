/* Configuration */
var options = {
	connection: {
		secure: true,
		reconnect: true
	},
	channels: [ defaultSettings.channel ]
};

var chat = document.getElementById('chat'),
	chatContainer = document.getElementById('chat-container'),
	scrollDistance = 0, // How many pixels are we currently still hiding?
	scrollReference = 0; // Distance when we started scrolling;

/* Store settings with a local cache. Storing these variables directly in localStorage would remove the variable's type information */
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
			console.log('Config reset');
		}
	}
}();

/* Interface interactions */
document.getElementById('settings-wheel').addEventListener('click', () => document.getElementById('settings').classList.toggle('hidden'));
// Style
['background-color', 'odd-background-color', 'separator-color', 'text-color', 'user-color', 'moderator-color'].forEach(key => {
	document.getElementById('settings-' + key).value = Settings.get(key);
	document.getElementById('settings-' + key).addEventListener('change', (e) => Settings.set(key, e.target.value));
});
// Behavior
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
document.getElementById('settings-format-urls').checked = Settings.get('format-urls');
document.getElementById('settings-format-urls').addEventListener('click', () => Settings.toggle('format-urls'));
document.getElementById('settings-shorten-urls').checked = Settings.get('shorten-urls');
document.getElementById('settings-shorten-urls').addEventListener('click', () => Settings.toggle('shorten-urls'));

document.body.addEventListener('keydown', (e) => {
	if ((e.key == "H" || e.key == "h") && e.shiftKey && e.ctrlKey) {
		document.getElementById('curtain').classList.toggle('hidden');
	} else if ((e.key == "S" || e.key == "s") && e.shiftKey && e.ctrlKey) {
		document.getElementById('settings').classList.toggle('hidden');
	} else if ((e.key == "Escape")) {
		document.getElementById('settings').classList.add('hidden');
	}
});

/* Retrieve chat */
var client = new tmi.client(options);
client.addListener('message', handleChat);
client.connect();

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

/* Inspirated by https://gist.github.com/AlcaDesign/742d8cb82e3e93ad4205 */
function handleChat(channel, userstate, message, self) {
	//console.log(channel, userstate, message);
	var chatLine = document.createElement('div'),
		chatName = document.createElement('span'),
		chatColon = document.createElement('span'),
		chatMessage = document.createElement('span');

	// Fill chat line with content
	chatName.className = 'chat-user';
	if (userstate.mod) {
		chatName.classList.add('moderator');
	}
	chatName.textContent = userstate['display-name'] || userstate.username;
	chatColon.className = 'chat-colon';
	chatMessage.innerHTML = formatMessage(message, userstate.emotes);
	chatLine.appendChild(chatName);
	chatLine.appendChild(chatColon);
	chatLine.appendChild(chatMessage);
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

function replaceText(text, replacement, from, to) {
	for (var i = from + 1; i <= to; i++) {
		text[i] = '';
	}
	text.splice(from, 1, replacement);
}

function formatLinks(text, originalText) {
	var urlRegex = /https?:\/\/(www\.)?([0-9a-zA-Z-_\.]+\.[0-9a-zA-Z-_]+\/)([0-9a-zA-Z-_#=\/\.\?\|]+)?/g;
	var match;
	while ((match = urlRegex.exec(originalText)) !== null) {
		var urlText = match[0];
		if (Settings.get('shorten-urls') && match[3].length > 15) {
			urlText = match[2] + ' &hellip; ';
			if (match[3].lastIndexOf('/') == -1) {
				// No directory structure in the URL
				urlText += match[3].slice(-7);
			} else {
				// Show last directory if it is not too long
				urlText += match[3].substring(match[3].lastIndexOf('/')).slice(-10);
			}
		}
		var replacement = Settings.get('format-urls') ? '<a href="' + match[0] + '" target="_blank" rel="noreferrer noopener">' + urlText + '</a>' : urlText;
		replaceText(text, replacement, match.index, match.index + match[0].length - 1);
	}
	return text;
}

function htmlEntities(html) {
	return html.map((character) => {
		if (character.length == 1) {
			return character.replace(/[\u00A0-\u9999<>\&]/gim, (match) => '&#' + match.charCodeAt(0) + ';');
		}
		return character;
	});
}