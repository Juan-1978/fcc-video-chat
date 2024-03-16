import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.5/firebase-app.js';
import { getDatabase, set, ref, get } from 'https://www.gstatic.com/firebasejs/9.6.5/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyAHv5PTqCeMjQHJl2QW3t-XfiuMHJSKk6Q",
    authDomain: "video-chat-5bd98.firebaseapp.com",
    databaseURL: "https://video-chat-5bd98-default-rtdb.firebaseio.com",
    projectId: "video-chat-5bd98",
    storageBucket: "video-chat-5bd98.appspot.com",
    messagingSenderId: "116179469559",
    appId: "1:116179469559:web:2b98b41d4a4f54c6b6fff2",
    measurementId: "G-NGDKWVG27V"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase();

const APP_ID = "28f95eb94c2441e983b3cbb225e45e8a";

let peerConnection;
let localStream;
let remoteStream;
let uid = String(Math.floor(Math.random() * 10000));
let token = null;
let sendId = null;
let client;
let channel;
let roomName;

const room = document.getElementById('room');
const userOne = document.getElementById('user-1');
const userTwo = document.getElementById('user-2');

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.1.google.com:19302', 'stun:stun2.1.google.com:19302']
        }
    ]
};

const typeRoomName = async (text) => {

    while (true) {
        roomName = prompt(text, '');
        if (roomName === null) {
            continue;
        }
        roomName = roomName.trim();
        if (roomName !== '') {
            try {
                const database = getDatabase();
                const roomRef = ref(database, 'rooms');
                const snapshot = await get(roomRef);
                const firebaseRooms = snapshot.val() || [];
                const index = firebaseRooms.findIndex(room => room.name === roomName);
                if (index === -1) {
                    firebaseRooms.push({ name: roomName, count: 1 });
                } else if (index >= 0 && firebaseRooms[index].count >= 2) {
                    alert(`Room ${roomName} is full. Please click OK and try a different room.`);
                    continue;
                } else {
                    firebaseRooms[index].count++;
                }
                await set(roomRef, firebaseRooms);
                break;

            } catch (error) {
                console.error('Error setting room data:', error);
                throw error;
            }
        }
    }

    return roomName;
};

const init = async (text) => {

    typeRoomName(text);

    client = await AgoraRTM.createInstance(APP_ID);
    await client.login({ uid, token });

    channel = client.createChannel(roomName);
    channel.join();
    room.innerText = roomName;

    channel.on('MemberJoined', handlePeerJoined);
    client.on('MessageFromPeer', handleMessageFromPeer);

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    userOne.srcObject = localStream;

};

const handlePeerJoined = async (MemberId) => {
    console.log('A new peer has joined this room:', MemberId);
    createOffer(MemberId);
};

const handlePeerLeft = () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteStream = null;
    userTwo.srcObject = remoteStream;
};

const handleMessageFromPeer = async (message, MemberId) => {
    message = JSON.parse(message.text);
    
    switch (message.type) {
        case 'offer':
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                userOne.srcObject = localStream;
            }
            document.getElementById('offer-sdp').value = JSON.stringify(message.offer);
            createAnswer(MemberId);
            break;
        case 'answer':
            document.getElementById('answer-sdp').value = JSON.stringify(message.answer);
            addAnswer();
            break;
        case 'candidate':
            if (peerConnection) {
                peerConnection.addIceCandidate(message.candidate);
            }
            break;
        case 'leave':
            handlePeerLeft();
            break;
        default:
            console.error('Unknown message type:', message.type);
    }
};

const createPeerConnection = async (sdpType, MemberId) => {
    peerConnection = new RTCPeerConnection(servers);
    sendId = MemberId;

    remoteStream = new MediaStream();
    userTwo.srcObject = remoteStream;

    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = async (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        })
    };

    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            document.getElementById(sdpType).value = JSON.stringify(peerConnection.localDescription);
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId);
        }
    };
};

const createOffer = async (MemberId) => {
    createPeerConnection('offer-sdp', MemberId);

    let offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    document.getElementById('offer-sdp').value = JSON.stringify(offer);
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offer }) }, MemberId);
};

const createAnswer = async (MemberId) => {
    createPeerConnection('answer-sdp', MemberId);

    let offer = document.getElementById('offer-sdp').value;
    if (!offer) return alert('Retieve offer from peer fisrt...');

    offer = JSON.parse(offer);
    await peerConnection.setRemoteDescription(offer);

    let answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    document.getElementById('answer-sdp').value = JSON.stringify(answer);
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answer }) }, MemberId);
};

const addAnswer = async () => {
    let answer = document.getElementById('answer-sdp').value;
    if (!answer) return alert('Retrieve answer from peer first...');

    answer = JSON.parse(answer);

    if (!peerConnection.currentRemoteDescription) {
        peerConnection.setRemoteDescription(answer);
    }
};

const leaveRoom = async () => {

    if (sendId !== null) {
        client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'leave', 'leave': 'MemberLeft' }) }, sendId);
    }

    const roomId = room.textContent;

    room.innerText = '';
    userOne.srcObject = null;
    userTwo.srcObject = null;

    const database = getDatabase();
    const roomRef = ref(database, 'rooms');
    const snapshot = await get(roomRef);
    const firebaseRooms = snapshot.val() || [];
    const index = firebaseRooms.findIndex(room => room.name === roomId);

    firebaseRooms[index].count--;
    if (firebaseRooms[index].count === 0) {
        firebaseRooms.splice(index, 1);
    }
    await set(roomRef, firebaseRooms); 
};

const handleSound = () => {
    const soundButton = document.getElementById('mute');
    const videos = document.querySelectorAll('video');
    videos.forEach(function(video) {
        if (video.muted) {
            video.muted = false;
            soundButton.style.backgroundColor = 'cadetblue';
            soundButton.innerText = 'Sound Off';
        } else {
            video.muted = true;
            soundButton.style.backgroundColor = 'gray';
            soundButton.innerText = 'Sound On';
        }
    });   

};

document.getElementById("leave").addEventListener("click", leaveRoom);
document.getElementById("mute").addEventListener("click", handleSound);

init('Type a room:');
