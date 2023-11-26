const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;

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

// create middlewares
const logger = async (req, res, next) => {
    console.log('log info:', req.method, req.url)
    next();
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db('outPollDB').collection('users');
    const surveyCollection = client.db('outPollDB').collection('surveys');

    // auth related api
    app.post('/jwt', logger, async (req, res) => {
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
    app.get('/users', async (req, res) => {
        const result = await userCollection.find().toArray();
        res.send(result);
    });

    // get user role
    app.get('/user/:email', async (req, res) => {
        const email = req.params.email
        const result = await userCollection.findOne({ email })
        res.send(result)
    })

    // get surveys and filter by title, category, price
    app.get('/surveys', async (req, res) => {
        try {
            let queryObj = {}
            let sortObj = {}

            const title = req.query.title;
            const category = req.query.category;
            const sortField = req.query.sortField;
            const sortOrder = req.query.sortOrder;

            if(title){
                queryObj.title = title;
            }

            if(category){
                queryObj.category = category;
            }

            if(sortField && sortOrder){
                sortObj[sortField] = sortOrder;
            }

            const cursor = surveyCollection.find(queryObj).sort(sortObj);
            const result = await cursor.toArray();
            res.send(result);
        } 
        catch(error) {
            console.log(error)
        }
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