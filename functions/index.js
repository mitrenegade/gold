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
    // console.log("renderGold: body " + JSON.stringify(req.body, null, ' '))
    if (words.count === 0) {
        return res.send(instructions())
    } else {
       // console.log(`Text: ${text} user_id: ${user_id} channel_id ${channel_id}`)
    }

    const command = words[0]
    if (command === "star") {
        const to_id = words[1]
        if (to_id === undefined) {
            console.log("star: Invalid recipient id")
            // because this function returns a promise, cannot just return a string
            return res.send("Please tell me who to give the star to!")
        } else {
            return star(to_id, user_id, channel_id).then(result => {
                return res.send(result)
            })
        }
    } else if (command === "awards") {
        return myStarCount(user_id).then(result => {
            return res.send(result)
        })
    } else if (command === "leader") {
        return leaderBoard().then(result => {
            return res.send(result)
        })
    } else if (command === "off") {
        return updateEnableGold(user_id, false).then(result => {
            return res.send("You have opted out of Gold.")
        })
    } else if (command === "on") {
        return updateEnableGold(user_id, true).then(result => {
            return res.send("You have opted into Gold.")
        })
    } else {
        console.log("unknown command: " + command)
        return res.send(instructions())
    }
})

instructions = function() {
    return "Gold usage: /gold action params\nAvailable actions:\n star: give someone a gold star\nawards: display your gold awards\nleader: display the leaderboard\noff: opt out of Gold\non: opt in to Gold"
}

star = function(to_id, from_id, channel_id) {
    return incrementStarCount(to_id).then(result => {
        console.log("giveGoldStar success with result " + JSON.stringify(result))
        let awards = result.count
        var starText = "star"
        if (awards !== 1) {
            starText = "awards"
        }
        let channelMessage = `<@${from_id}> awarded a gold star to ${to_id}, who now has ${awards} ${starText}`
        let messageUrl = "https://slack.com/api/chat.postMessage"
        let params = {
            "channel": channel_id,
            "text": channelMessage
        }
        let headers = {
            "Content-type": "application/json",
            "Authorization": `Bearer ${config.slack.bot_token}`
        }

        // console.log("Params " + JSON.stringify(params))
        return postRequest(messageUrl, headers, params)
    }).then(results => {
        // message to sender: `You sent ${to_id} a gold star`
        return `You sent ${to_id} a gold star`
    }).catch(err => {
        if (err.message === "User has opted out") {
            return `This person has opted out and cannot receive awards.`
        } else if (err.message === "Channel not found") {
            return `You sent ${to_id} a gold star but @gold is not in this channel. Please invite @gold to announce awards to the channel (optional).`
        } else {
            return err.message
        }
    })
};

myStarCount = function(userId) {
    let ref = db.collection(`awards`).doc(userId)
    return ref.get().then(doc => {
        if (!doc.exists) {
            console.log("No matching documents for " + userId)
            return "No awards for you!"
        }
        let data = doc.data()
        console.log("userId " + userId + " data: " + JSON.stringify(data))
        var count = data.count
        if (count === undefined) {
            count = 0
        }
        return `You have ${count} awards!`
    })
}

leaderBoard = function() {
    let ref = db.collection(`awards`).orderBy('count', 'desc').limit(5)
    return ref.get().then(snapshot => {
        if (snapshot.empty) {
            console.log("No matching documents for max awards")
            return "No one has any awards :cry:"
        }
        var rankingString = ""
        snapshot.forEach(doc => {
            let data = doc.data()
            // console.log("goldLeader data: " + JSON.stringify(data))
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

updateEnableGold = function(userId, enabled) {
    let ref = db.collection(`awards`).doc(userId)
    return ref.set({active: enabled})
}

incrementStarCount = function(userId) {
    let awardsRef = db.collection('awards').doc(userId)
    return db.runTransaction(t => {
        return t.get(awardsRef).then(doc => {
            var newCount = 0
            if (!doc.exists) {
                // does not exist yet
                newCount = 1
                return t.set(awardsRef, {count: newCount, displayName: userId})
            } else {
                if (doc.data().active === false) {
                    console.log(`User ${userId} has opted out, cannot increment`)
                    throw new Error("User has opted out")
                } else {
                    newCount = doc.data().count + 1;
                    return t.update(awardsRef, {count: newCount, displayName: userId})
                }
            }
        })
    }).then(result => {
        console.log("IncrementStarCount Transaction success")
        return awardsRef.get()
    }).then(doc => {
        return doc.data()
    })
}

// help with API calls - used for messaging
postRequest = function(url, headers, body) {
    // console.log("Request to " + url + ": body " + JSON.stringify(body))
    var options = {
        method: 'POST',
        uri: url,
        headers: headers,
        body: body,
        json: true // Automatically stringifies the body to JSON
    };
    return rp(options).then(results => {
        console.log("PostRequest results: " + JSON.stringify(results))
        if (results.ok === false && results.error === "channel_not_found") {
            throw new Error("Channel not found")
        }
        return results
    })
}
