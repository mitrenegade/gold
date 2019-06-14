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

/* root command usage: /gold action params
 * params available from body:
 * channel_id
 * channel_name
 * user_id: sender
 * user_name
 * text: all text after the command ("action params")
 */
exports.renderGold = functions.https.onRequest((req, res) => {
    const text = req.body.text
    const user_id = req.body.user_id
    const channel_id = req.body.channel_id

    var words = text.split(' ')
    console.log("renderGold: text " + text + " split into words " + words)
    if (words.count === 0) {
        console.log("Empty command, show instructions")
        return res.send(instructions())
    } else {
        console.log(`Text: ${text} user_id: ${user_id} channel_id ${channel_id}`)
    }

    const command = words[0]
    console.log("command: " + command)
    if (command === "star") {
        const to_id = words[1]
        return star(to_id, user_id, channel_id).then(result => {
            return res.send(result)
        }).catch(err => {
            console.log("star failure ", err)
            return res.status(500).json(err)
        })
    } else if (command === "stars") {
        return res.send(myStarCount(user_id))
    } else if (command === "leader") {
        return res.send(leaderBoard())
    } else if (command === "off") {
        return res.send("off")
    } else if (command === "on") {
        return (res.send("on"))
    } else {
        console.log("unknown command: " + command)
        return res.send(instructions())
    }
})

instructions = function() {
    return "Gold usage: /gold action params\nAvailable actions:\n star: give someone a gold star\nstars: display your gold stars\nleader: display the leaderboard\noff: opt out of Gold\non: opt in to Gold"
}

star = function(to_id, from_id, channel_id) {
    // working: sets to 1
    // let ref = db.collection(`stars`).doc(to_id)
    // return ref.set({
    // 	count: 1
    // }).then(result => {
    // 	console.log("updated stars for " + to_id)
    //     return res.send("updated stars for " + to_id)
    // })
    if (to_id === undefined) {
        console.log("Invalid recipient id")
        throw new Error({"message": "Invalid recipient id"})
    }

    return incrementStarCount(to_id).then(result => {
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
        return `You sent ${to_id} a gold star`
    })
};

myStarCount = function(userId) {
    // working: sets to 1
    let ref = db.collection(`stars`).doc(userId)
    return ref.get().then(doc => {
        if (!doc.exists) {
            console.log("No matching documents for " + userId)
            return "No stars for you!"
        }
        let data = doc.data()
        console.log("userId " + userId + " data: " + JSON.stringify(data))
        var count = data.count
        if (count === undefined) {
            count = 0
        }
        return `You have ${count} stars!`
    })
}

leaderBoard = function() {
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
    })
}

incrementStarCount = function(userId) {
    let starsRef = db.collection('stars').doc(userId)
    return db.runTransaction(t => {
        return t.get(starsRef).then(doc => {
            console.log("Doc " + doc + " exists " + doc.exists)
            var newCount = 0
            if (!doc.exists) {
                // does not exist yet
                newCount = 1
                return t.set(starsRef, {count: newCount, displayName: userId})
            } else {
                newCount = doc.data().count + 1;
                return t.update(starsRef, {count: newCount, displayName: userId})
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
