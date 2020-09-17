/* Inspirated by https://gist.github.com/AlcaDesign/742d8cb82e3e93ad4205 */

var options = {
	connection: {
		secure: true,
		reconnect: true
	},
	channels: [ "loadingreadyrun" ]
};

var chat = document.getElementById('chat'),
	chatContainer = document.getElementById('chat-container');;
var scrollDistance = 0, // How many pixels are we currently still hiding?
	scrollReference = 0, // Distance when we started scrolling
	scrollDuration = 1; // Time in seconds allowed for a message to appear

var client = new tmi.client(options);
client.addListener('message', handleChat);
client.connect();

// Continually scroll up, in a way to make the comments readable
var lastFrame = +new Date();
function scrollUp(now) {
	if (scrollDistance > 0) {
		// Estimate how far along we are in scrolling in the current scroll reference
		var currentStep = (scrollDuration * 1000) / (now - lastFrame);
		scrollDistance -= scrollReference / currentStep;
		scrollDistance = Math.max(Math.floor(scrollDistance), 0);
		chatContainer.scrollTop = scrollDistance;
	}
	lastFrame = now;
	window.requestAnimationFrame(scrollUp);
}
window.requestAnimationFrame(scrollUp);
chatContainer.scrollTop = 0;

function handleChat(channel, userstate, message, self) {
	console.log(channel, userstate, message);
	var chatLine = document.createElement('div'),
		chatName = document.createElement('span'),
		chatColon = document.createElement('span'),
		chatMessage = document.createElement('span');

	// Fill chat line with content
	chatName.className = 'chat-author';
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