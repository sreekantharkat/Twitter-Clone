const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite = require('sqlite3')
const jwt = require('jsonwebtoken')

const app = express()
const jsonMiddleWare = express.json()
app.use(jsonMiddleWare)

let loggedInuser = null

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite.Database,
    })
    app.listen(3000, () => {
      console.log('http://localhost:3000/')
    })
  } catch (err) {
    console.log(`DB Error : ${err.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']

  if (authHeader === undefined) {
    response.status(400)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(authHeader, 'My_Secret_Key', async (err, payload) => {
      if (err) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

const isUserFollowing = async (request, response, next) => {
  const {username} = request
  const {tweetId} = request.params

  const followingUserQuery = `
  SELECT * FROM USER
  LEFT JOIN FOLLOWER ON
  FOLLOWER.FOLLOWING_USER_ID = USER.USER_ID
  WHERE FOLLOWER_USER_ID = "${username}";
  `
  const dbUser = await db.all(followingUserQuery)
  const dbResult = dbUser.map(eachItem => {
    return {
      user_id: eachItem.user_id,
    }
  })

  const tweetQuery = `
  SELECT * FROM TWEET WHERE TWEET_ID = ${tweetId};
  `
  const tweetResponse = await db.get(tweetQuery)
  let tweetedUserId = null
  if (tweetResponse !== undefined) {
    tweetedUserId = tweetResponse.user_id
  }

  const findTheIndex = dbResult.findIndex(eachItem => {
    if (eachItem.user_id === tweetedUserId) {
      return true
    }
  })

  if (findTheIndex === -1) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    request.username = username
    next()
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const userDetailsQuery = `
  SELECT * FROM USER WHERE USERNAME = "${username}";
  `

  const dbResponse = await db.get(userDetailsQuery)

  if (dbResponse === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `
      INSERT INTO USER (NAME, USERNAME, PASSWORD, GENDER)
      VALUES (
        "${name}",
        "${username}",
        "${hashedPassword}",
        "${gender}"
      )
      `
      await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const getUserFromDb = `
  SELECT * FROM USER WHERE USERNAME = "${username}";
  `
  const dbResponse = await db.get(getUserFromDb)
  if (dbResponse === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const comparePassword = await bcrypt.compare(password, dbResponse.password)
    if (comparePassword) {
      const payload = {username}
      loggedInuser = dbResponse.user_id
      const jwtToken = await jwt.sign(payload, 'My_Secret_Key')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// API - 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const userIdQuery = `
  SELECT * FROM USER WHERE USER.USERNAME = "${username}";
  `
  const {user_id} = await db.get(userIdQuery)
  const getTweetsFeed = `
  select * from follower
   inner join tweet on follower.following_user_id = tweet.user_id 
   inner join user on tweet.user_id = user.user_id 
   where follower.follower_user_id = ${user_id}
   order by tweet.date_time desc limit 4;
  `

  /* 
  SELECT
  user.username, tweet.tweet, tweet.date_time AS dateTime
  FROM
  follower
  INNER JOIN tweet
  ON follower.following_user_id = tweet.user_id
  INNER JOIN user
  ON tweet.user_id = user.user_id
  WHERE
  follower.follower_user_id = ${id of the loggedin user}
  ORDER BY
  tweet.date_time DESC
  LIMIT 4;`
  */
  const dbResponse = await db.all(getTweetsFeed)
  const result = dbResponse.map(eachItem => {
    const {username, tweet, date_time} = eachItem
    return {
      username,
      tweet,
      dateTime: date_time,
    }
  })
  response.send(result)
})

// API - 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const userIdQuery = `
  SELECT * FROM USER WHERE USER.USERNAME = "${username}";
  `
  const {user_id} = await db.get(userIdQuery)

  const followingUserQuery = `
  SELECT * FROM USER
  LEFT JOIN FOLLOWER ON
  FOLLOWER.FOLLOWING_USER_ID = USER.USER_ID
  WHERE FOLLOWER_USER_ID = ${user_id};
  `
  const followingUserResponse = await db.all(followingUserQuery)
  const result = followingUserResponse.map(eachItem => {
    const {name} = eachItem
    return {
      name,
    }
  })
  response.send(result)
})

app.get('/user/followers/', authenticateToken, async (request, resposne) => {
  const {username} = request
  const userIdQuery = `
  SELECT * FROM USER WHERE USER.USERNAME = "${username}";
  `
  const {user_id} = await db.get(userIdQuery)
  const followersUserQuery = `
  SELECT * FROM FOLLOWER
  LEFT JOIN USER ON USER.USER_ID = FOLLOWER.FOLLOWER_USER_ID 
  WHERE FOLLOWING_USER_ID = ${user_id};
  `

  const dbUser = await db.all(followersUserQuery)
  const result = dbUser.map(eachItem => {
    const {name} = eachItem
    return {
      name,
    }
  })
  resposne.send(result)
})

app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request.params

    const tweetQuery = `
    SELECT * FROM TWEET WHERE TWEET_ID = ${tweetId};
    `
    const tweetResponse = await db.get(tweetQuery)

    const likeQuery = `
  select * from like where tweet_id = ${tweetId}
  `

    const replyQuery = `
  SELECT * FROM REPLY WHERE TWEET_ID = ${tweetId}
  `

    const likeResponse = await db.all(likeQuery)
    const replyResponse = await db.all(replyQuery)
    const likes = likeResponse.length
    const replies = replyResponse.length
    const result = {
      tweet: tweetResponse.tweet,
      likes: likes,
      replies: replies,
      dateTime: tweetResponse.date_time,
    }
    response.send(result)
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request.params
    const likesQuery = `
  SELECT * FROM LIKE LEFT JOIN USER ON LIKE.USER_ID = USER.USER_ID WHERE LIKE.TWEET_ID = ${tweetId};
  `

    const likeResponse = await db.all(likesQuery)
    const likedUsers = {likes: []}
    likeResponse.map(eachItem => {
      return likedUsers.likes.push(eachItem.name)
    })
    response.send(likedUsers)
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request.params
    const likesQuery = `
  SELECT * FROM REPLY LEFT JOIN USER ON REPLY.USER_ID = USER.USER_ID WHERE REPLY.TWEET_ID = ${tweetId};
  `

    const replyResponse = await db.all(likesQuery)
    const repliedUsers = []
    replyResponse.map(eachItem => {
      return repliedUsers.push({
        name: eachItem.name,
        reply: eachItem.reply,
      })
    })
    response.send(repliedUsers)
  },
)

app.get('/users/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const userIdQuery = `
  SELECT * FROM USER WHERE USER.USERNAME = "${username}";
  `
  const {user_id} = await db.get(userIdQuery)
  const userTweets = `
  SELECT * FROM TWEET WHERE USER_ID = ${user_id};
  `
  const tweetsResponse = await db.all(userTweets)
  let userTweetsandReplies = []
  for (let eachItem of tweetsResponse) {
    const likesAndRepliesQuery = `
      SELECT * FROM LIKE LEFT JOIN REPLY ON LIKE.TWEET_ID = REPLY.TWEET_ID
      WHERE LIKE.TWEET_ID = ${eachItem.tweet_id};
      `

    const likeAndReplyResponse = await db.all(likesAndRepliesQuery)

    const likes = []
    const replies = []

    likeAndReplyResponse.map(eachItem => {
      likes.push(eachItem.like_id)
      replies.push(eachItem.reply_id)
    })

    userTweetsandReplies.push({
      tweet: eachItem.tweet,
      likes: likes.length,
      replies: replies.length,
      dateTime: eachItem.date_time,
    })
  }
  response.send(userTweetsandReplies)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const userIdQuery = `
  SELECT * FROM USER WHERE USER.USERNAME = "${username}";
  `
  const {user_id} = await db.get(userIdQuery)
  const {tweet} = request.body
  const createTweetQuery = `
  INSERT INTO TWEET (TWEET, USER_ID) VALUES ("${tweet}", ${user_id});
  `
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params

    const tweetQuery = `
    SELECT * FROM TWEET WHERE TWEET_ID = ${tweetId}
    `
    const tweetResponse = await db.get(tweetQuery)

    if (tweetResponse !== undefined) {
      if (loggedInuser !== tweetResponse.user_id) {
        response.status(401)
        response.send('Invalid Request')
      } else {
        const deleteQuery = `
          DELETE FROM TWEET WHERE TWEET_ID = ${tweetId};
          `
        const deleteResponse = await db.run(deleteQuery)
        response.send('Tweet Removed')
      }
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
