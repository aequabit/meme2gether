/* Load packages */
var app = require('express')();
var request = require('http');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var moment = require('moment');
var _ = require('underscore');
var validUrl = require('valid-url');
var youtubedl = require('youtube-dl');
var sprintf = require('sprintf-js').sprintf;
var vsprintf = require('sprintf-js').vsprintf

/* Object to store variables */
var storage = {
	/* The port the webserver listens to */
	"httpPort" : 1337,

	/* The default image displayed in the image section */
	'currentImage' : 'http://oi65.tinypic.com/i6gsbs.jpg',

	/* The default video title, uploader and resolution */
	'currentVideoTitle' : null,
	'currentVideoUploader' : null,
	'currentVideoResolution' : null,

	/* The default video displayed in the video section */
	'currentVideoUrl' : 'https://r12---sn-4g57kn7s.googlevideo.com/videoplayback?nh=IgpwcjAyLmZyYTE2KgkxMjcuMC4wLjE&upn=p12RUZUH9OM&initcwndbps=10550000&sparams=clen%2Cdur%2Cei%2Cgir%2Cid%2Cinitcwndbps%2Cip%2Cipbits%2Citag%2Clmt%2Cmime%2Cmm%2Cmn%2Cms%2Cmv%2Cnh%2Cpl%2Cratebypass%2Crequiressl%2Csource%2Cupn%2Cexpire&source=youtube&pl=24&ei=nbwsWPrEBt38WJrmtqgH&lmt=1429522834789485&ip=5.230.147.63&expire=1479348477&id=o-AO97Ev3xXWxXPHJ2R8mnNLcQ56HgYj91tp_Co81Lki0m&gir=yes&mn=sn-4g57kn7s&mm=31&signature=23DB106F59FB7FC183E7D715F0A9C9D790C1AF70.4F5512E92A79AD53599E2471462B582CB7515DE3&itag=18&mv=m&mt=1479326711&ms=au&key=yt6&dur=199.296&requiressl=yes&ratebypass=yes&ipbits=0&clen=9036193&mime=video%2Fmp4',

	/* The time the default video starts at */
	'currentVideoTime' : '0',

	/* User list */
	'users' : {},

	/* History */
	'history' : []
};

/**
* Logging function
*/
function log () {
	var i;
	var args = [];
	for (i = 1; i < arguments.length; i++) {
		args.push(arguments[i]);
	}
	console.log('[%s] %s', moment().format('HH:mm:ss'), vsprintf(arguments[0], args));
}

/* HTTP routes */
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/html/index.html');
});
app.get('*', function (req, res) {
	res.sendFile(__dirname + '/html/404.html');
});

/* New connection */
io.on('connection', function (socket) {
	/* Store the user's socket and it's corresponding IP address in the users object */
	storage.users[socket] = socket.request.connection.remoteAddress;
	log('%s: connected', storage.users[socket]);

	/* Broadcast the user count */
	io.emit('users count', _.keys(storage.users).length);

	/* Broadcast the history */
	io.emit('history list', storage.history);

	/* Log the join message */
	log('%s: client connected', storage.users[socket]);

	/* History */
	socket.on('history list', function () {
		socket.emit('history list', storage.history);
	});

	/* Received chat message */
	socket.on('chat message', function (data) {
		/* Check if the message is empty */
		if (data.message.length > 0) {
			/* Log it to the console */
			log('%s (%s): chat message: \'%s\'', storage.users[socket], data.user, data.message);

			/* Broadcast the message */
			io.emit('chat message', { user: data.user, message: data.message });
		} else {
			/* Log an error message (usually only occuring when user manipulated the frontend) */
			log('%s (%s): empty chat message', storage.users[socket], data.user);
		}
	});

	/* Image url get */
	socket.on('image get', function () {
		socket.emit('image set', storage.currentImage);
	});

	/* Image url set */
	socket.on('image set', function (url) {
		if (validUrl.isUri(url)) {
			log('updated image: %s', url);
			storage.currentImage = url;
			io.emit('image set', storage.currentImage);

			/* Push to the history */
			storage.history.push(sprintf('Image: <a href="%s" target="_blank">%s</a>', url, url));

			/* Broadcast the history */
			io.emit('history list', storage.history);
		} else {
			log('%s: received invalid url: %s', storage.users[socket], url);
		}
	});

	/* Video play */
	socket.on('video play', function (time) {
		//console.log('play, time: %s', time);
		io.emit('video play', time);
		storage.currentVideoTime = time;
	});

	/* Video pause */
	socket.on('video pause', function (time) {
		//console.log('pause, time: %s', time);
		io.emit('video pause', time);
		storage.currentVideoTime = time;
	});

	/* Video time get */
	socket.on('video time get', function () {
		socket.emit('video time set', storage.currentVideoTime);
	});

	/* Video time set */
	socket.on('video time set', function (time) {
		//console.log('update, time: %s', time);
		storage.currentVideoTime = time;
	});

	/* Video get */
	socket.on('video get', function () {
		socket.emit('video set', { title: storage.currentVideoName, uploader: storage.currentVideoUploader, resolution: storage.currentVideoResolution, url: storage.currentVideoUrl });
	});

	/* Video set */
	socket.on('video set', function (url) {
		/* If the url is valid */
		if (validUrl.isUri(url)) {
			/* If the url is a youtube video */
			if (url.indexOf('youtube.com') !== -1) {
				/* Get the youtube video data */
				var video = youtubedl(url,
					['--format=18'],
					{ cwd: __dirname });

					/* Info callback */
					video.on('info', function(info) {
						/* Number to store the highest available resolution */
						highest = 0;

						/* String to store the displayed resolution */
						fullresolution = 'unknown';

						/* Object to store all resolutions and their correstponding video url */
						var resolutions = {};
						console.log(info);
						/* Loop through all video formats */
						info['formats'].forEach(function (element) {
							/* If height, width and url exist */
							if ('height' in element && 'width' in element && element['width'] != null && element['height'] != null && element['width'] != undefined && element['height'] != undefined && element['url'] != undefined) {
								/* If the video has audio */
								if (element['acodec'] != 'none') {
									/* If the resolution is higher than the current one */
									if (highest < element['width']) {
										/* Update the current resolution */
										fullresolution = element['width'] + 'x' + element['height'];
										highest = element['width'];
									}
									/* Store the resolution with it's url */
									resolutions[element['width']] = element['url'];
								}
							}
						});
						/* Give out status message */
						log('%s: updated video (from youtube %s) - highest available resolution with audio: %s - url: %s', storage.users[socket], url, highest, resolutions[highest]);

						/* Push to the history */
						storage.history.push(sprintf('YouTube: <a href="%s" target="_blank">%s</a> by <b><a href="%s" target="_blank">%s</a></b>', url, info.fulltitle, info.uploader_url, info.uploader));

						/* Broadcast the history */
						io.emit('history list', storage.history);

						/* Update the video for all clients */
						io.emit('video set', { title: info.fulltitle, uploader: info.uploader, resolution: fullresolution, url: resolutions[highest] });

						/* Update the config */
						storage.currentVideoName = info.fulltitle;
						storage.currentVideoUploader = info.uploader;
						storage.currentVideoResolution = fullresolution;
						storage.currentVideoUrl = resolutions[highest];
					});
				} else {
					/* If the url was a direct stream */
					log('%s: updated video: %s', storage.users[socket], url);

					/* Push to the history */
					storage.history.push(sprintf('Video: <a href="%s" target="_blank">%s</a>', url, url));

					/* Broadcast the history */
					io.emit('history list', storage.history);

					/* Unset title and resolution and update the video for all clients */
					// TODO: get resolution from video
					io.emit('video set', { title: null, uploader: null, resolution: null, url: storage.currentVideoUrl });
					storage.currentVideoName = null;
					storage.currentVideoUploader = null;
					storage.currentVideoResolution = null;
					storage.currentVideoUrl = url;
				}
			} else {
				/* If invalid url was received */
				log('%s: received invalid url', storage.users[socket]);
			}

		});

		/* User disconnect */
		socket.on('disconnect', function () {
			/* Remove the socket from the users object */
			log('%s: disconnected', storage.users[socket]);
			delete storage.users[socket];
		});
	});

	/* Start the webserver */
	http.listen(storage.httpPort, function () {
		log('HTTP listening on *:%s', storage.httpPort);
	});
