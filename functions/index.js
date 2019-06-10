const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);
let db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((req, res) => {
    var text = req.body.text
    console.log("helloWorld with text " + text)
    res.send("Hello from Firebase! " + text);
});

exports.giveGoldStar = functions.https.onRequest( (req, res) => {
    console.log("giveGoldStar with text: " + req.body.text)
    const toId = req.body.text
    if (toId === undefined) {
        console.log("Invalid recipient id")
        return res.status(500).json({"message": "Invalid recipient id"})
    }
    let ref = db.collection(`stars`).doc(toId)
    return ref.set({
    	count: 1
    }).then(result => {
    	console.log("updated stars for " + toId)
        return res.send("updated stars for " + toId)
    })
});
