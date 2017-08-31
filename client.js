//////// Let's begin by getting al html elements /////////
var divSelectRoom = document.getElementById("selectRoom");
var divConsultingRoom = document.getElementById("consultingRoom");
var inputRoomNumber = document.getElementById("roomNumber");
var btnGoRoom = document.getElementById("goRoom");
var localVideo = document.getElementById("localVideo");
var remoteVideo = document.getElementById("remoteVideo");

//////// Now let's initialize some variables
var roomNumber;
var localStream;
var remoteStream;
var rtcPeerConnection;
var iceServers = {
    'iceServers': [
        { 'url': 'stun:stun.services.mozilla.com' },
        { 'url': 'stun:stun.l.google.com:19302' }
    ]
}
var streamConstraints = { audio: true, video: true };
var isCaller;

/////// Let's go to it
var socket = io();

btnGoRoom.onclick = function () {
    if (inputRoomNumber.value === '') {
        alert("Please type a room number")
    } else {
        roomNumber = inputRoomNumber.value;
        socket.emit('create or join', roomNumber);
        divSelectRoom.style = "display: none;";
        divConsultingRoom.style = "display: block;";
    }
};

socket.on('created', function (room) {
    navigator.mediaDevices.getUserMedia(streamConstraints).then(function (stream) {
        localStream = stream;
        localVideo.src = URL.createObjectURL(stream);
        isCaller = true;
        notesDiv.style = "display: block";
    }).catch(function (err) {
        console.log('An error ocurred when accessing media devices');
    });
});

socket.on('joined', function (room) {
    navigator.mediaDevices.getUserMedia(streamConstraints).then(function (stream) {
        localStream = stream;
        localVideo.src = URL.createObjectURL(stream);
        socket.emit('ready', roomNumber);
    }).catch(function (err) {
        console.log('An error ocurred when accessing media devices');
    });
});

socket.on('candidate', function (event) {
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate
    });
    rtcPeerConnection.addIceCandidate(candidate);
});

socket.on('ready', function () {
    if (isCaller) {
        createPeerConnection();
        rtcPeerConnection.createOffer(setLocalAndOffer, function (e) { console.log(e) });
    }
});

socket.on('offer', function (event) {
    if (!isCaller) {
        createPeerConnection();
        rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
        rtcPeerConnection.createAnswer(setLocalAndAnswer, function (e) { console.log(e) });
    }
});

socket.on('answer', function (event) {
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
})

////// Some backend functions
function onIceCandidate(event) {
    if (event.candidate) {
        console.log('sending ice candidate');
        socket.emit('candidate', {
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
            room: roomNumber
        })
    }
}

function onAddStream(event) {
    remoteVideo.src = URL.createObjectURL(event.stream);
    remoteStream = event.stream;
}

function setLocalAndOffer(sessionDescription) {
    rtcPeerConnection.setLocalDescription(sessionDescription);
    socket.emit('offer', {
        type: 'offer',
        sdp: sessionDescription,
        room: roomNumber
    });
}

function setLocalAndAnswer(sessionDescription) {
    rtcPeerConnection.setLocalDescription(sessionDescription);
    socket.emit('answer', {
        type: 'answer',
        sdp: sessionDescription,
        room: roomNumber
    });
}

/////// Upload file code
var fileInput = document.getElementById("fileInput");

fileInput.onchange = function () {
    const files = fileInput.files;
    const file = files[0];
    if (file == null) {
        return alert('No file selected.');
    }
    getSignedRequest(file);
}

function getSignedRequest(file) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/sign-s3?file-name=${file.name}&file-type=${file.type}`);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                uploadFile(file, response.signedRequest, response.url);
            }
            else {
                alert('Could not get signed URL.');
            }
        }
    };
    xhr.send();
}

function uploadFile(file, signedRequest, url) {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedRequest);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                alert('File ' + file.name + ' saved at ' + url);
                if (dataChannel) {
                    console.log('sending file link');
                    var obj = {
                        name: file.name,
                        url: url
                    };
                    dataChannel.send(JSON.stringify(obj));
                }
            }
            else {
                alert('Could not upload file.');
            }
        }
    };
    xhr.send(file);
}

/////// Adding data channel for sending file link
var dataChannel;
var filesSent = document.getElementById("filesSent");

function createPeerConnection() {
    rtcPeerConnection = new RTCPeerConnection(iceServers);
    rtcPeerConnection.onicecandidate = onIceCandidate;
    rtcPeerConnection.onaddstream = onAddStream;

    dataChannel = rtcPeerConnection.createDataChannel('files');
    dataChannel.onopen = dataChannelStateChanged;
    rtcPeerConnection.ondatachannel = receiveDataChannel;

    rtcPeerConnection.addStream(localStream);
}

function dataChannelStateChanged() {
    console.log('data channel state changed to' + dataChannel.readyState);
    if (dataChannel.readyState === 'open') {
        dataChannel.onmessage = receiveDataChannelMessage;
    }
}

function receiveDataChannel(event) {
    console.log('data received ' + JSON.stringify(event));
    dataChannel = event.channel;
    dataChannel.onmessage = receiveDataChannelMessage;
}

function receiveDataChannelMessage(event) {
    console.log('adding file for download ');
    var obj = JSON.parse(event.data);
    
    var li = document.createElement("li");
    var a = document.createElement("a");
    
    a.appendChild(document.createTextNode(obj.name));
    a.setAttribute('href',obj.url);
    a.setAttribute('target','_blank');
    li.appendChild(a);

    filesSent.appendChild(li);
}

////// Adding saving to database
var patient = document.getElementById('patient');
var notes = document.getElementById('notes');
var save = document.getElementById('save');
var notesDiv = document.getElementById('notesDiv');

save.onclick = function () {
    if (patient === '' || notes === '') {
        alert('Please fill the form');
    } else {
        saveData();
    }
}

function saveData() {
    const xhr = new XMLHttpRequest();
    var params = JSON.stringify({
        patient: patient.value,
        notes: notes.value
    });
    xhr.open('POST', '/save');
    
    xhr.setRequestHeader("Content-type", "application/json; charset=utf-8");
    xhr.setRequestHeader("Content-length", params.length);
    xhr.setRequestHeader("Connection", "close");

    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                alert('Data saved');
            }
            else {
                alert('Could not save data.');
            }
        }
    };
    xhr.send(params);
}