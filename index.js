const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(cors({
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174',
    ],
    credentials: true
  }));
app.use(express.json());
app.use(cookieParser());

// MongoDB connection uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vlh5tw1.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// verify token
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    console.log(token)
    if (!token) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.log(err)
        return res.status(401).send({ message: 'unauthorized access' })
      }
      req.user = decoded
      next()
    })
  }

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db('outPollDB').collection('users');
    const surveyCollection = client.db('outPollDB').collection('surveys');
    const participantCollection = client.db('outPollDB').collection('participants');
    const commentCollection = client.db('outPollDB').collection('comments');
    const paymentCollection = client.db("outPollDB").collection("payments");

    // Role verification middlewares
    // For admin
    const verifyAdmin = async (req, res, next) => {
        const user = req.user
        // console.log('user from verify admin', user)
        const query = { email: user?.email }
        const result = await userCollection.findOne(query)
        if (!result || result?.role !== 'admin')
          return res.status(401).send({ message: 'unauthorized access' })
        next()
      }
  
    // For surveyor
    const verifySurveyor = async (req, res, next) => {
        const user = req.user
        const query = { email: user?.email }
        const result = await userCollection.findOne(query)
        if (!result || result?.role !== 'surveyor')
          return res.status(401).send({ message: 'unauthorized access' })
        next()
    }

    // auth related api
    app.post('/jwt', async (req, res) => {
        try {
            const user = req.body;
            // console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: '1h'
            });
            res
            .cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none'
            })
            .send({ success: true })
        }
        catch(error) {
            console.log(error)
        }
    })  

    app.post('/signout', async (req, res) => {
        try {
            const user = req.body;
            // console.log('sign out', user);
            res
            .clearCookie('token', { 
                secure: true,
                sameSite: 'none',
                maxAge: 0 
            })
            .send({ success: true })
        }
        catch(error) {
            console.log(error)
        }
    })

    // send user data to the server
    app.post('/users', async (req, res) => {
        const user = req.body;
        const query = { email: user.email }
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: 'user already exists', insertedId: null })
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
    });

    // get all users
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
        let queryObj = {}

        const role = req.query.role;
    
        if (role) {
            queryObj.role = role;
        }

        const result = await userCollection.find(queryObj).toArray();
        res.send(result);
    });

    // get user role
    app.get('/user/:email', async (req, res) => {
        const email = req.params.email
        const result = await userCollection.findOne({ email })
        res.send(result)
    })

    // update user role
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: {
            role: 'surveyor'
            }
        }
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
    })

    // send surveys
    app.post('/surveys', async (req, res) => {
        try {
             const newSurvey = req.body;
             const result = await surveyCollection.insertOne(newSurvey);
             res.send(result);
        }
        catch(error) {
         console.log(error)
        }
    })

    // get surveys for all and filter by title, category, vote
    app.get('/surveys', async (req, res) => {
        try {
            let queryObj = {}
    
            const title = req.query.title;
            const category = req.query.category;
    
            if (title) {
                queryObj.title = title;
            }
    
            if (category) {
                queryObj.category = category;
            }
    
            const cursor = surveyCollection.find(queryObj);
            const surveys = await cursor.toArray();
    
            const voteCounts = await participantCollection.aggregate([
                {
                    $group: {
                        _id: '$title',
                        totalVotes: { $sum: 1 }
                    }
                }
            ]).toArray();
    
            const result = surveys.map(survey => {
                const vote = voteCounts.find(vote => vote._id === survey.title);
                const votesCount = vote ? vote.totalVotes : 0;
                return { ...survey, votes: votesCount };
            });
    
            res.send(result);
        } catch (error) {
            console.log(error);
        }
    });

    // get survey for surveyor
    app.get('/surveys/surveyor/:email', verifyToken, verifySurveyor, async (req, res) => {
        const email = req.params.email
        const result = await surveyCollection.find({ 'surveyor': email }).toArray()
        res.send(result)
      })

    // get single survey
    app.get('/surveys/:id', async(req, res) => {
        try {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await surveyCollection.findOne(query);
            res.send(result);
        }
        catch(error) {
            console.log(error)
        }
    })

    // update surveys
    app.put('/surveys/:id', verifyToken, verifySurveyor, async(req, res) => {
        try {
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)}
            const options = { upsert: true };
            const updatedSurvey = req.body;
      
            const survey = {
                $set: {
                    title: updatedSurvey.title, 
                    description: updatedSurvey.description, 
                    category: updatedSurvey.category, 
                    deadline: updatedSurvey.deadline, 
                    options: updatedSurvey.options, 
                    like: updatedSurvey.like, 
                    dislike: updatedSurvey.dislike, 
                    report: updatedSurvey.report, 
                    vote: updatedSurvey.vote, 
                    votes: updatedSurvey.votes, 
                    timestamp: updatedSurvey.timestamp, 
                }
            }
            const result = await surveyCollection.updateOne(filter, survey, options);
            res.send(result);
        }
        catch(error) {
            console.log(error)
        }
    })

     // update survey status
     app.patch('/surveys/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: {
            status: 'unpublish'
            }
        }
        const result = await surveyCollection.updateOne(filter, updatedDoc);
        res.send(result);
    })

    // Send participants
    app.post('/participants', async (req, res) => {
        try {
            const participantSurvey = req.body;
    
            const existingEntry = await participantCollection.findOne({
                participant_email: participantSurvey.participant_email,
                title: participantSurvey.title
            });
    
            if (existingEntry) {
                const updatedFields = {};
    
                if (participantSurvey.like !== undefined) {
                    updatedFields.like = participantSurvey.like;
                }
    
                if (participantSurvey.dislike !== undefined) {
                    updatedFields.dislike = participantSurvey.dislike;
                }
    
                if (participantSurvey.report !== undefined) {
                    updatedFields.report = participantSurvey.report;
                }
    
                await participantCollection.updateOne(
                    { _id: existingEntry._id },
                    { $set: updatedFields }
                );
    
                return res.status(200).json({ message: 'updated successfully' });
            }
    
            // If the user hasn't participated yet, insert the new entry
            const result = await participantCollection.insertOne(participantSurvey);
            res.send(result);
        } catch (error) {
            console.log(error);
        }
    });
    
    // get all participants
    app.get('/participants', verifyToken, async (req, res) => {
        const result = await participantCollection.find().toArray();
        res.send(result);
    });

    // send comments
    app.post('/comments', async (req, res) => {
        try {
             const commentSurvey = req.body;
             const result = await commentCollection.insertOne(commentSurvey);
             res.send(result);
        }
        catch(error) {
         console.log(error)
        }
    })

    // get all comments
    app.get('/comments', verifyToken, verifySurveyor, async (req, res) => {
        const result = await commentCollection.find().toArray();
        res.send(result);
    });

    // get specific comment
    app.get('/comments/:surveyId', verifyToken, async (req, res) => {
        try {
            const surveyId = req.params.surveyId;
            const result = await commentCollection.find({ 'surveyId': surveyId }).toArray();
            res.send(result);
        } catch (error) {
            console.log(error);
        }
    });


    app.get('/user-votes', verifyToken, async (req, res) => {
        const voteCounts = await participantCollection.aggregate([
            {
                $group: {
                    _id: '$title',
                    yes: {
                        $sum: { $arrayElemAt: ['$votes', 0] } 
                    },
                    no: {
                        $sum: { $arrayElemAt: ['$votes', 1] }
                    },
                    totalCount: { $sum: 1 } 
                }
            },

            {
                $project: {
                    _id: 0,
                    title: '$_id',
                    yes: 1,
                    no: 1,
                    totalCount: 1
                }
            }
        ]).toArray();        
        res.send({voteCounts})
    })

    app.get('/votes', verifyToken, async (req, res) => {
        const voteCounts = await participantCollection.aggregate([
            {
                $group: {
                    _id: '$participant_name',
                    yes: {
                        $sum: { $arrayElemAt: ['$votes', 0] } 
                    },
                    no: {
                        $sum: { $arrayElemAt: ['$votes', 1] }
                    },
                    totalCount: { $sum: 1 } 
                }
            },

            {
                $project: {
                    _id: 0,
                    participant_name: '$_id',
                    yes: 1,
                    no: 1,
                    totalCount: 1
                }
            }
        ]).toArray();        
        res.send({voteCounts})
    })

    // payment intent
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        // console.log(amount, 'amount inside the intent')
  
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });
  
        res.send({
          clientSecret: paymentIntent.client_secret
        })
    });

    // send payments
    app.post('/payments', verifyToken, async (req, res) => {
        const payment = req.body;
        const paymentResult = await paymentCollection.insertOne(payment);
        // console.log('payment info', paymentResult)

        const userEmail = payment.email;
    
        const updatedUser = await userCollection.updateOne(
            { email: userEmail, role: 'user' }, 
            { $set: { role: 'pro user' } },
        );

        // console.log('User role updated:', updatedUser);

        res.send(paymentResult);
    })

    // get payments
    app.get('/payments', verifyToken, verifyAdmin, async (req, res) => {
        const result = await paymentCollection.find().toArray();
        res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('OutPoll server is running')
})

app.listen(port, () => {
    console.log(`OutPoll is running on port: ${port}`)
})