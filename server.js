/* Load packages */
var app = require('express')();
var request = require('http');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var validUrl = require('valid-url');
var youtubedl = require('youtube-dl');

/* Configuration */
var config = {
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
	'currentVideoTime' : '0'
};


/* HTTP routes */
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/html/index.html');
});
app.get('*', function (req, res) {
	res.sendFile(__dirname + '/html/404.html');
});


/* New connection */
io.on('connection', function (socket) {
	/* Get the client's IP address */
	var clientIp = socket.request.connection.remoteAddress;
	
	/* Log the join message */
	console.log('%s: client connected', clientIp);	
	
	/* Received chat message */
	socket.on('chat message', function (data) {
		/* Check if the message is empty */
		if (data.message.length > 0) {
			/* Log it to the console */
			console.log('%s (%s): chat message: \'%s\'', clientIp, data.user, data.message);
			
			/* Broadcast the message */
			io.emit('chat message', { user: data.user, message: data.message });
			} else {
			/* Log an error message (usually only occuring when user manipulated the frontend) */
			console.log('%s (%s): empty chat message', clientIp, data.user);
		}
	});
	
	/* Image url get */
	socket.on('image get', function () {
		socket.emit('image set', config.currentImage);
	});
	
	/* Image url set */
	socket.on('image set', function (url) {
		if (validUrl.isUri(url)) {
			console.log('updated image: %s', url);
			config.currentImage = url;
			io.emit('image set', config.currentImage);
			} else {
			console.log('%s: received invalid url: %s', clientIp, url);
		}
	});
	
	/* Video play */
	socket.on('video play', function (time) {
		//console.log('play, time: %s', time);
		io.emit('video play', time);
		config.currentVideoTime = time;
	});
	
	/* Video pause */
	socket.on('video pause', function (time) {
		//console.log('pause, time: %s', time);
		io.emit('video pause', time);
		config.currentVideoTime = time;
	});
	
	/* Video time get */
	socket.on('video time get', function () {
		socket.emit('video time set', config.currentVideoTime);
	});
	
	/* Video time set */
	socket.on('video time set', function (time) {
		//console.log('update, time: %s', time);
		config.currentVideoTime = time;
	});
	
	/* Video get */
	socket.on('video get', function () {
		socket.emit('video set', { title: config.currentVideoName, uploader: config.currentVideoUploader, resolution: config.currentVideoResolution, url: config.currentVideoUrl });
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
					console.log('updated video (from youtube %s) - highest available resolution with audio: %s - url: %s', url, highest, resolutions[highest]);
					
					/* Update the video for all clients */
					io.emit('video set', { title: info.fulltitle, uploader: info.uploader, resolution: fullresolution, url: resolutions[highest] });
					
					/* Update the config */
					config.currentVideoName = info.fulltitle;
					config.currentVideoUploader = info.uploader;
					config.currentVideoResolution = fullresolution;
					config.currentVideoUrl = resolutions[highest];
				});
				} else {
				/* If the url was a direct stream */
				console.log('updated video: %s', url);
				
				/* Unset title and resolution and update the video for all clients */
				// TODO: get resolution from video
				io.emit('video set', { title: null, uploader: null, resolution: null, url: config.currentVideoUrl });
				config.currentVideoName = null;
				config.currentVideoUploader = null;
				config.currentVideoResolution = null;
				config.currentVideoUrl = url;
			}
			} else {
			/* If invalid url was received */
			console.log('%s: received invalid url', clientIp);
		}
		
	});
	
	/* User disconnect */
	socket.on('disconnect', function (socket) {
		console.log('%s: client disconnected', clientIp);
	});
});

/* Start the webserver */
http.listen(config.httpPort, function () {
	console.log('HTTP listening on *:%s', config.httpPort);
});
