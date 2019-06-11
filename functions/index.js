const functions = require('firebase-functions');
const admin = require('firebase-admin');
const rp = require('request-promise-native')

admin.initializeApp(functions.config().firebase);
let db = admin.firestore();

const config = functions.config().dev

exports.helloWorld = functions.https.onRequest((req, res) => {
    var user_name = req.body.user_name
    var user_id = req.body.user_id
    console.log("helloWorld with body " + JSON.stringify(req.body, null, " "))
    res.send("Hello <@" + user_id + ">");
});

exports.giveGoldStar = functions.https.onRequest( (req, res) => {
    console.log("giveGoldStar with body: " + JSON.stringify(req.body, null, " "))
    const to_id = req.body.text
    const to_name = req.body.text
    const from_id = req.body.user_id
    const channel_id = req.body.channel_id
    if (to_id === undefined) {
        console.log("Invalid recipient id")
        return res.status(500).json({"message": "Invalid recipient id"})
    }

    // working: sets to 1
    // let ref = db.collection(`stars`).doc(to_id)
    // return ref.set({
    // 	count: 1
    // }).then(result => {
    // 	console.log("updated stars for " + to_id)
    //     return res.send("updated stars for " + to_id)
    // })

    return incrementStarCount(to_id, to_name).then(result => {
        console.log("giveGoldStar success with result " + JSON.stringify(result))
        let stars = result.count
        var starText = "star"
        if (stars !== 1) {
            starText = "stars"
        }
        let channelMessage = `<@${from_id}> awarded a gold start to ${to_id}, who now has ${stars} ${starText}`
        let messageUrl = "https://slack.com/api/chat.postMessage"
        let params = {
            "channel": channel_id,
            "text": channelMessage
        }
        let headers = {
            "Content-type": "application/json",
            "Authorization": `Bearer ${config.slack.bot_token}`
        }

        console.log("Params " + JSON.stringify(params))
        return postRequest(messageUrl, headers, params)
    }).then(results => {
        // message to sender: `You sent ${to_id} a gold star`
        return res.send(`You sent ${to_id} a gold star`)
    }).catch(err => {
        console.log("giveGoldStar failure ", err)
        return res.status(500).json(err)
    })
});


incrementStarCount = function(userId, username) {
    let starsRef = db.collection('stars').doc(userId)
    return db.runTransaction(t => {
        return t.get(starsRef).then(doc => {
            console.log("Doc " + doc + " exists " + doc.exists)
            var newCount = 0
            if (!doc.exists) {
                // does not exist yet
                newCount = 1
                return t.set(starsRef, {count: newCount, displayName: username})
            } else {
                newCount = doc.data().count + 1;
                return t.update(starsRef, {count: newCount, displayName: username})
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
postRequest = function(url, headers, body) {
    console.log("Request to " + url + ": body " + JSON.stringify(body))
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
        headers: headers,
        body: body,
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

exports.goldLeader = functions.https.onRequest( (req, res) => {
        // working: sets to 1
    let ref = db.collection(`stars`).orderBy('count', 'desc').limit(5)
    return ref.get().then(snapshot => {
        if (snapshot.empty) {
            console.log("No matching documents for max stars")
            return "No star leaders!"
        }
        var rankingString = ""
        snapshot.forEach(doc => {
            let data = doc.data()
            console.log("goldLeader data: " + JSON.stringify(data))
            var name = data.displayName
            if (name !== undefined) {
                var count = data.count
                if (count === undefined) {
                    count = 0
                }

                rankingString = rankingString + name + ": " + `${count}` + `\n`
            }
        })
        return rankingString
    }).then(result => {
        console.log("GoldLeader results: " + result)
        return res.send(result)
    }).catch(err => {
        console.log("GoldLeader error: " + err.message)
        return res.status(500).json(err)
    })
})