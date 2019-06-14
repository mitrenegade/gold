const functions = require('firebase-functions');
const admin = require('firebase-admin');
const rp = require('request-promise-native')

admin.initializeApp(functions.config().firebase);
let db = admin.firestore();

const config = functions.config().prod

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
    const userName = req.body.user_name
    const channel_id = req.body.channel_id
    const channel_name = req.body.channel_name

    var words = text.split(' ')
    console.log("renderGold: body " + JSON.stringify(req.body, null, ' '))
    if (words.count === 0) {
        return res.send(instructions())
    } else {
       // console.log(`Text: ${text} user_id: ${user_id} channel_id ${channel_id}`)
    }

    const command = words[0]
    if (command === "award") {
        const to_id = words[1]
        if (to_id === undefined) {
            console.log("giveAward: Invalid recipient id")
            // because this function returns a promise, cannot just return a string
            return res.send("Please tell me who to award!")
        } else {
            return giveAward(to_id, user_id, channel_id).then(result => {
                return res.send(result)
            })
        }
    } else if (command === "awards") {
      var awardType = ""
      return getChannelTypeFromId(channel_id).then(result => {
        let awardType = result
        return myAwardCount(user_id, userName, awardType)})
      .then(result => {
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
    } else if (command === "set") {
        // /gold set award donut
        const awardCommand = words[1]
        const awardType = words[2]
        if (awardCommand !== "award" || awardType === undefined) {
            return res.send("Usage: /gold set award <type>")
        }
        return setAwardType(channel_id, awardType).then(result => {
            var channelStr = channel_name
            if (channel_name === "privategroup") {
                channelStr = "this channel"
            }
            return res.send("Award type for " + channelStr + " changed to " + awardType)
        })
    } else {
        console.log("unknown command: " + command)
        return res.send(instructions())
    }
})

instructions = function() {
    return "Gold usage: /gold action params\nAvailable actions:\n award: give someone a gold star\nawards: display your awards\nleader: display the leaderboard\noff: opt out of Gold\non: opt in to Gold\nset: change channel settings"
}

giveAward = function(to_id, from_id, channel_id) {
    var awardType = ""
    return getChannelTypeFromId(channel_id).then(result => {
        awardType = result
        return incrementStarCount(to_id)
    }).then(result => {
          console.log("giveGoldAward success with result " + JSON.stringify(result))
          let awards = result.count
          let channelMessage = `<@${from_id}> awarded a ${awardType} to ${to_id}, whose ${awardType} total is ${awards}`
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
      return `You sent ${to_id} a ${awardType}`
  }).catch(err => {
      if (err.message === "User has opted out") {
          return `This person has opted out and cannot receive awards.`
      } else if (err.message === "Channel not found") {
          return `You sent ${to_id} a ${awardType} but @gold is not in this channel. Please invite @gold to announce awards to the channel (optional).`
      }
      else {
          return err.message
      }
  })
};

getChannelTypeFromId = function(channelId) {
    let defaultType = "star"
    let ref = db.collection(`channelInfo`).doc(channelId)
    return ref.get().then(doc => {
      if (!doc.exists) {
          console.log("No matching documents for " + channelId)
          return defaultType
      }
      let data = doc.data()
      var type = data.type
      if (type !== undefined) {
          return type
      }
      console.log("Channel:"+ channelId + " does not have an associated award type")
      return defaultType
    })
}

myAwardCount = function(userId, userName, awardType) {
    let key = "<@"+ userId + "|" + userName + ">"
    let ref = db.collection(`awards`).doc(key)
    return ref.get().then(doc => {
        if (!doc.exists) {
            console.log("No matching documents for " + key)
            return "No awards for you!"
        }
        let data = doc.data()
        console.log("userId " + key + " data: " + JSON.stringify(data))
        var count = data.count
        if (count === undefined) {
            count = 0
        }
        return `Your ${awardType} total is ${count}!`
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

setAwardType = function(channelId, awardType) {
    let ref = db.collection(`channelInfo`).doc(channelId)
    return ref.set({type: awardType})
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
