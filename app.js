// @flow
const util = require('util');
const crypto = require('crypto');
const fs = require('fs');

var callerId = require('caller-id');

var express = require('express');
var web = express();
var server = require('http').Server(web);
var io = require('socket.io')(server);
var ioc = require('socket.io-client');

var debug = true;

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
  var rest = this.slice(parseInt(to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

Array.prototype.insert = function(item, position) {
  if (!!position) {
    this.splice(position, 0, item);
  } else {
    this.push(item);
  }
};

var Class = function(methods) {
  var klass = function() {
    this.initialize.apply(this, arguments);
  };
  for (var property in methods) {
    klass.prototype[property] = methods[property];
  }
  if (!klass.prototype.initialize) klass.prototype.initialize = function(){};
  return klass;
};

web.use(express.static('public'));

var classes = {
  "Queue": Class({
    initialize: function() {
      this.queue = [];
    },
    add: function(track) {
      this.queue.insert(track);
    },
    del: function(id) {
      for (var i = 0; i < this.queue.length; i++) {
        if (this.queue[i].getId() == id) {
          this.queue.delete(i);
          break;
        }
      }
    },
    list: function() {
      return this.queue;
    },
    swap: function(a, b) {
      if (a >= 0 && a < this.queue.length && b >= 0 && b < this.queue.length) {
        var tmp = this.queue[a];
        this.queue[a] = this.queue[b];
        this.queue[b] = tmp;
      }
    },
		clear: function() {
			for (var i = 0; i < this.queue.length; i++) {
				this.queue.delete(i);
			}
		},
		loadQueueFromPlaylist: function(name){
			if(runtime.playlists[name]){
				this.clear();
				runtime.playlists[name].tracks.forEach(function(trackinfo){
					this.add(new classes.Track(trackinfo.service, trackinfo.path));
				});
			}
		},
		saveQueueAsPlaylist: function(name){
			runtime.playlists[name]={
				tracks: []
			}
			this.queue.forEach(function(track){
				var trackinfo={
					service: track.getService(),
					path:	track.getPath()
				};
				runtime.playlists[name].tracks.insert(trackinfo);
			});
			fs.writeFile('playlists.json', JSON.stringify(runtime.playlists), 'utf-8');
		}
  }),
  "Track": Class({
    initialize: function(service, path, time) {
      this.service = service;
      this.path = path;
      this.time = time || new Date().getTime();
      this.id = crypto.createHash('sha1').update(this.service + '-' + this.time + '-' + this.path, 'utf8').digest('hex');
    },
    getService: function() {
      return this.service;
    },
    getPath: function() {
      return this.path;
    },
    getTime: function() {
      return this.time;
    },
    getId: function() {
      return this.id;
    },
    validService: function(availableServices) {
      return this.getService() in availableServices;
    }
  })
};

var runtime = new (function(undefined) {
    this.started = new Date().getTime();
    this.queue = new classes.Queue();
    this.playback_time = 0;
    this.playing = true;
    this.playlists = JSON.parse(fs.readFileSync('playlists.json', 'utf8'));
    this.log = function(msg) {
      var caller = callerId.getData();
      if (callerId.getString() == null) {
        console.log.apply(this, arguments);
      } else {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('LOG: ' + callerId.getDetailedString() + '():');
        console.log.apply(this, args);
      }
    };
    this.info = function() {
      var caller = callerId.getData();
      if (debug) {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('INFO: ' + callerId.getDetailedString() + '():');
        console.log.apply(this, args);
      } else {
        console.log.apply(this, arguments);
      }
    };
    this.socketdata = function(socket) {
      // always return object as reference to the socket
      if (!socket['data']) {
        socket['data'] = {};
      }
      return socket['data'];
    };
    this.userLoggedin = function(socket) {
      return (!!this.socketdata(socket).user && !!this.socketdata(socket).user.authenticated);
    };
})();

server.listen(8080, function() {
  runtime.log('Web interface is running on port 8080!');
  // api is used as a connection between POST requests and socket
  var api = express();
  var bodyParser = require("body-parser");
  api.use(bodyParser.urlencoded({ extended: false }));
  api.use(bodyParser.json());
  var client;

  api.get('*', function apiGet(req, res) {
    //console.log(generate_id('file', 'Witchqueen-of-Eldorado.mp3', started));
    client.emit('test');
    res.end('This api doesn\'t work through GET. Please switch to POST!');
  });

  api.post('*', function apiPost(req, res) {
    // req.body contains the json data sent as POST data
    client.emit('test');
    res.end('Not specified');
  });

  api.listen(3000, function() {
    runtime.log('Api is running on port 3000!');
    client = ioc('http://localhost:8080');
  });
});

io.on('connection', function ioOnConnection(socket) {
  runtime.log('Client connected');
  socket.on('disconnect', function(){
    console.log('Client disconnected');
  });
  socket.on('test', function() {
    runtime.log('Someone successfully tested something!');
  });
  socket.on('login', function(data) {
    if (data.username && data.password) {
      runtime.log('I like turtles!');
      runtime.socketdata(socket).user.name = data.username;
      runtime.socketdata(socket).user.authenticated = true;
    } else {
      runtime.log('I can\'t use that information u gave me!', data);
    }
  });
  socket.on('logout', function() {
    runtime.socketdata(socket).user.authenticated = true;
    runtime.socketdata(socket).user = undefined;
  });
  socket.on('add_track', function socketAddTrack(data) {
    if (!runtime.userLoggedin(socket)) {
      return;
    }
    if (data.track) {
      var track = data.track;
      if (track.service && track.path) {
        runtime.queue.add(new classes.Track(track.service, track.path, track.time || undefined));
      } else {
        runtime.log('This doesn\'t seem to be a valid track.');
      }
    } else {
      runtime.log('What do you want from me?');
    }
  });
  socket.on('delete_track', function socketDeleteTrack(data) {
    if (data.track) {
      if (data.track.id) {
        runtime.queue.del(data.track.id);
      } else {
        runtime.log('This track seems to be missing a id.');
      }
    } else {
      runtime.log('What do you want from me?');
    }
  });
  socket.on('reorder_track', function socketReorderTrack(data) {
    if (data.a && data.b) {
      runtime.queue.swap(data.a, data.b);
    } else {
      runtime.log('What did you try to achieve?');
    }
  });
  socket.on('get_queue', function socketGetQueue(data) {
    io.to(socket.id).emit('get_queue', { "queue": runtime.queue.list() });
  });
	socket.on('get_playlist', function(data) {
		if(data.name){
			io.to(socket.id).emit('get_playlist', { "tracks": runtime.playlists[data.name].tracks});
		} else {
			var playlistnames = [];
			for (var key in runtime.playlists) {
				playlistnames.insert(key);
			}
			io.to(socket.id).emit('get_playlist', {"playlists": playlistnames});
		}
	});
  socket.on('clear_queue', function socketClearQueue() {
    runtime.queue.clear();
  });
  socket.on('get_current_track', function socketCurrentTrack() {
    //runtime.log("Request currentTrack");
    //runtime.log(JSON.stringify(runtime.queue[0]));
    io.to(socket.id).emit('get_current_track', {'currentTrack': runtime.queue[0]||new classes.Track("youtube","jHPOzQzk9Qo"/*"filesystem","epicsaxguy.wav"*/), 'time': runtime.playback_time, 'playing':runtime.playing});
  });
  socket.on('next',function socketNextElement(){
    //TODO logic for setting next track
    runtime.playback_time=0;
    io.sockets.emit("poll");
  });
  socket.on('prev', function socketPrevElement(){
    //TODO logic for setting previous track
    runtime.playback_time=0;
    io.sockets.emit('poll');
  });
  socket.on('current_Time',function onCurrentTime(data){
    runtime.log(data["time"]);
    runtime.playback_time=data["time"];
  });
  socket.on('play',function onPlay(){
    runtime.log("Play");
    runtime.playing = true;
    io.sockets.emit("poll");
  });
  socket.on("pause",function onPause(){
    runtime.log("Pause");
    runtime.playing = false;
    io.sockets.emit("get_current_time");
    io.sockets.emit("poll");
  });
  socket.on('isPlaying',function onIsPlaying(){
    io.to(socket.id).emit('isPlaying', {'playing': runtime.playing});
  });
});
