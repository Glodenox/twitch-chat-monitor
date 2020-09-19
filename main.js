/* Configuration */
var options = {
	connection: {
		secure: true,
		reconnect: true
	},
	channels: [ "emongg" ]
};

var chat = document.getElementById('chat'),
	chatContainer = document.getElementById('chat-container'),
	scrollDistance = 0, // How many pixels are we currently still hiding?
	scrollReference = 0, // Distance when we started scrolling
	newMessagesOnTop = getConfig('new-messages-on-top', 'true') == 'true',
	smoothScroll = getConfig('smooth-scroll', 'true') == 'true',
	scrollDuration = parseInt(getConfig('smooth-scroll-duration', 1000)), // Time in milliseconds allowed for a message to appear
	styles = { 'background-color': '', 'odd-background-color': '', 'separator-color': '', 'text-color': '', 'user-color': '', 'moderator-color': '' };
Object.keys(styles).forEach(key => {
	styles[key] = getConfig(key, getComputedStyle(document.body).getPropertyValue('--' + key).trim());
	document.body.style.setProperty('--' + key, styles[key]);
});

/* Interface interactions */
document.getElementById('settings-wheel').addEventListener('click', () => document.getElementById('settings').classList.toggle('hidden'));
// Style
Object.keys(styles).forEach(key => {
	document.getElementById('settings-' + key).value = styles[key];
	document.getElementById('settings-' + key).addEventListener('change', (e) => {
		styles[key] = e.target.value;
		document.body.style.setProperty('--' + key, e.target.value);
		localStorage.setItem(key, e.target.value);
	});
});
// Behavior
document.body.classList.toggle('reverse-order', !newMessagesOnTop);
document.getElementById('settings-new-messages-on-top').checked = newMessagesOnTop;
document.getElementById('settings-new-messages-on-top').addEventListener('click', () => {
	newMessagesOnTop = !newMessagesOnTop;
	localStorage.setItem('new-messages-on-top', newMessagesOnTop);
	document.body.classList.toggle('reverse-order', !newMessagesOnTop);
	scrollDistance = scrollReference = 0;
	chatContainer.scrollTop = newMessagesOnTop ? 0 : chatContainer.scrollTopMax;
});
document.getElementById('settings-smooth-scroll').checked = smoothScroll;
document.getElementById('settings-smooth-scroll').addEventListener('click', () => {
	smoothScroll = !smoothScroll;
	localStorage.setItem('smooth-scroll', smoothScroll);
	scrollDistance = scrollReference = 0;
	chatContainer.scrollTop = newMessagesOnTop ? 0 : chatContainer.scrollTopMax;
	document.getElementById('settings-smooth-scroll').parentNode.nextElementSibling.classList.toggle('hidden', !smoothScroll);
});
if (smoothScroll) {
	document.getElementById('settings-smooth-scroll').parentNode.nextElementSibling.classList.remove('hidden');
}
document.getElementById('settings-smooth-scroll-duration').value = scrollDuration;
document.getElementById('settings-smooth-scroll-duration').addEventListener('input', (e) => {
	var duration = parseInt(e.target.value);
	if (!isNaN(duration) && e.target.validity.valid) {
		scrollDuration = duration;
		localStorage.setItem('smooth-scroll-duration', scrollDuration);
	}
});

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

// Continually scroll up, in a way to make the comments readable
var lastFrame = +new Date();
function scrollUp(now) {
	if (smoothScroll && scrollDistance > 0) {
		// Estimate how far along we are in scrolling in the current scroll reference
		var currentStep = scrollDuration / (now - lastFrame);
		scrollDistance -= scrollReference / currentStep;
		scrollDistance = Math.max(scrollDistance, 0);
		chatContainer.scrollTop = Math.round(newMessagesOnTop ? scrollDistance : chatContainer.scrollTopMax - scrollDistance);
	}
	lastFrame = now;
	window.requestAnimationFrame(scrollUp);
}
window.requestAnimationFrame(scrollUp);

function getConfig(key, defaultValue) {
	var item = localStorage.getItem(key);
	return item === null ? defaultValue : item;
}

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
	chatMessage.innerHTML = formatEmotes(message, userstate.emotes);
	chatLine.appendChild(chatName);
	chatLine.appendChild(chatColon);
	chatLine.appendChild(chatMessage);
	chat.appendChild(chatLine);

	// Calculate height for smooth scrolling
	scrollReference = scrollDistance += chatLine.scrollHeight;
	if (!newMessagesOnTop && !smoothScroll) {
		chatContainer.scrollTop = chatContainer.scrollTopMax;
	}

	// Check whether we can remove the two oldest messages
	if (chat.childNodes.length > 2 && window.innerHeight + scrollDistance < chat.scrollHeight - chat.firstChild.scrollHeight - chat.childNodes[1].scrollHeight) {
		chat.firstChild.remove();
		chat.firstChild.remove();
	}
}

function htmlEntities(html) {
	var isArray = Array.isArray(html);
	if (!isArray) {
		html = html.split('');
	}
	html = html.map(function(character) {
		if (character.length == 1) {
			return character.replace(/[\u00A0-\u9999<>\&]/gim, (match) => '&#' + match.charCodeAt(0) + ';');
		}
		return character;
	});
	if (!isArray) {
		html = html.join('');
	}
	return html;
}

function formatEmotes(text, emotes) {
	if (!emotes) {
		return htmlEntities(text);
	}
	var splitText = text.split('');
	for (var id in emotes) {
		emotes[id].forEach((range) => {
			if (typeof range == 'string') {
				range = range.split('-').map(index => parseInt(index));
				var length =  range[1] - range[0],
					empty = [""];
				for (var i = 0; i < length; i++) {
					empty.push("");
				}
				splitText = splitText.slice(0, range[0]).concat(empty).concat(splitText.slice(range[1] + 1, splitText.length));
				splitText.splice(range[0], 1, '<img class="emoticon" src="https://static-cdn.jtvnw.net/emoticons/v2/' + id + '/default/dark/1.0" />');
			}
		});
	};
	return htmlEntities(splitText).join('');
}