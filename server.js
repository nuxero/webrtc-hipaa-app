var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var aws = require('aws-sdk');
var mysql = require('mysql');
var bodyParser = require("body-parser");

const S3_BUCKET = "webrtc-hipaa-app-files";
aws.config.region = 'us-east-1';
var con = mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USERNAME || 'root',
    password: process.env.MYSQL_PASSWORD || 'root',
    database: process.env.MYSQL_DATABASE || 'webrtc_hipaa_app',
    ssl: "Amazon RDS"
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/save', (req, res) => {
    console.log(JSON.stringify(req.body));
    var data = {};
    var date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    var sql = "INSERT INTO calls (date, patient, notes) VALUES (?)";
    var values = [
        [date, req.body.patient, req.body.notes]
    ]
    con.query(sql, values, (err, result) => {
        if (err) {
            console.log(err);
        } else {
            data = result;
            res.write(JSON.stringify(data));
            res.end();
        }
    });
});

app.get('/history', (req, res) => {
    var data = {};
    var sql = "SELECT * FROM calls";
    con.query(sql, (err, result) => {
        data = result;
        res.write(JSON.stringify(data));
        res.end();
    });
});

app.get('/sign-s3', (req, res) => {
    const s3 = new aws.S3();
    const fileName = req.query['file-name'];
    const fileType = req.query['file-type'];
    const s3Params = {
        Bucket: S3_BUCKET,
        Key: fileName,
        Expires: 60,
        ContentType: fileType,
        ACL: 'public-read',
        ServerSideEncryption: 'AES256' //Encryption at rest
    };

    s3.getSignedUrl('putObject', s3Params, (err, data) => {
        if (err) {
            console.log(err);
            return res.end();
        }
        const returnData = {
            signedRequest: data,
            url: `https://${S3_BUCKET}.s3.amazonaws.com/${fileName}` //an https endpoint
        };
        res.write(JSON.stringify(returnData));
        res.end();
    });
});

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/client.js', function (req, res) {
    res.sendFile(__dirname + '/client.js');
});

io.on('connection', function (socket) {
    console.log('a user connected');

    socket.on('create or join', function (room) {
        console.log('create or join to room ', room);

        var myRoom = io.sockets.adapter.rooms[room] || { length: 0 };
        var numClients = myRoom.length;

        console.log(room, ' has ', numClients, ' clients');

        if (numClients == 0) {
            socket.join(room);
            socket.emit('created', room);
        } else if (numClients == 1) {
            socket.join(room);
            socket.emit('joined', room);
        } else {
            socket.emit('full', room);
        }
    });

    socket.on('ready', function (room) {
        socket.broadcast.to(room).emit('ready');
    });

    socket.on('candidate', function (event) {
        socket.broadcast.to(event.room).emit('candidate', event);
    });

    socket.on('offer', function (event) {
        socket.broadcast.to(event.room).emit('offer', event.sdp);
    });

    socket.on('answer', function (event) {
        socket.broadcast.to(event.room).emit('answer', event.sdp);
    });

});

http.listen(3000, function () {
    console.log('listening on *:3000');
});
