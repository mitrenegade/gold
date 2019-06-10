const functions = require('firebase-functions');
const admin = require('firebase-admin');
const request = require('request')
const rp = require('request-promise-native')

admin.initializeApp(functions.config().firebase);
let db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((req, res) => {
    var user_name = req.body.user_name
    var user_id = req.body.user_id
    console.log("helloWorld with body " + JSON.stringify(req.body, null, " "))
    res.send("Hello <@" + user_id + ">");
});

exports.giveGoldStar = functions.https.onRequest( (req, res) => {
    console.log("giveGoldStar with text: " + req.body.text)
    const toId = req.body.text
    const fromId = req.body.user_id
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
        var starText = "star"
        if (stars !== 1) {
            starText = "stars"
        }
        return res.send(`<@${fromId}> awarded a gold start to ${toId}, who now has ${stars} ${starText}`)
    }).catch(err => {
        console.log("giveGoldStar failure ", err)
        return res.status(500).json(err)
    })
});


incrementStarCount = function(userId) {
    let starsRef = db.collection('stars').doc(userId)
    return db.runTransaction(t => {
        return t.get(starsRef).then(doc => {
            console.log("Doc " + doc + " exists " + doc.exists)
            var newCount = 0
            if (!doc.exists) {
                // does not exist yet
                newCount = 1
                return t.set(starsRef, {count: newCount})
            } else {
                newCount = doc.data().count + 1;
                return t.update(starsRef, {count: newCount})
            }
        })
    }).then(result => {
        console.log("IncrementStarCount Transaction success")
        return starsRef.get()
    }).then(doc => {
        return doc.data()
    })
}

// help with API calls - used for messaging
postRequest = function(url, params) {
    // console.log("Request to " + url + ": params " + JSON.stringify(params))
    // request.post(url,
    //     { 
    //         form: params,
    //     },
    //     function (e, r, body) {
    //         console.log("Response to " + url + ": body " + JSON.stringify(body))
    //         let json = JSON.parse(body)
    //     return json
    // });

    var options = {
        method: 'POST',
        uri: url,
        body: params,
        json: true // Automatically stringifies the body to JSON
    };
    return rp(options).then(results => {
        console.log("PostRequest results: " + JSON.stringify(results))
        return results
    }).catch(err => {
        console.log("PostRequest error: " + err.message)
        return err
    })
}