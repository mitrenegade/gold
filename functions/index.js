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

    // working: sets to 1
    // let ref = db.collection(`stars`).doc(toId)
    // return ref.set({
    // 	count: 1
    // }).then(result => {
    // 	console.log("updated stars for " + toId)
    //     return res.send("updated stars for " + toId)
    // })

    return incrementStarCount(toId).then(result => {
        console.log("giveGoldStar success with result " + JSON.stringify(result))
        let stars = result.count
        return res.send(`${toId} now has ${stars} stars`)
    }).catch(err => {
        console.log("giveGoldStar failure ", err)
        return res.status(500).json(err)
    })
});


incrementStarCount = function(userId) {
    let starsRef = db.collection('stars').doc(userId)
    return db.runTransaction(t => {
        return t.get(starsRef).then(doc => {
            let newCount = doc.data().count + 1;
            return t.update(starsRef, {count: newCount})
        })
    }).then(result => {
        console.log("IncrementStarCount Transaction success")
        return starsRef.get()
    }).then(doc => {
        return doc.data()
    })
}
