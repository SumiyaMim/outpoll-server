const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const surveyCollection = client.db('outPollDB').collection('surveys');

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