const express = require("express");
const mongoose = require("mongoose");
const dns = require("dns");

// Init project
const app = express();

// Database config
const mongoURI =
	"mongodb+srv://admin:Mordoklej1@fcc-to5px.mongodb.net/test?retryWrites=true&w=majority";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

// ------------------------------ Middleware ------------------------------

// Enable CORS so that your API is remotely testable by FCC
const cors = require("cors");
app.use(cors({ optionSuccessStatus: 200 })); // some legacy browsers choke on 204

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files
app.use(express.static(__dirname + "/public"));

// Not found middleware
// app.use((req, res, next) => {
// 	return next({ status: 404, message: "not found" });
// });

// Error Handling middleware
app.use((err, req, res, next) => {
	let errCode, errMessage;

	if (err.errors) {
		// mongoose validation error
		errCode = 400; // bad request
		const keys = Object.keys(err.errors);
		// report the first validation error
		errMessage = err.errors[keys[0]].message;
	} else {
		// generic or custom error
		errCode = err.status || 500;
		errMessage = err.message || "Internal Server Error";
	}
	res.status(errCode).type("txt").send(errMessage);
});

// ------------------------------ Routes ------------------------------

// Root
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

// ------------------------------ Timestamp microservice ------------------------------

app.get("/api/timestap/", function (req, res) {
	const date = new Date();
	res.json({ unix: date.getTime(), utc: date.toUTCString() });
});

app.get("/api/timestap/:date_string", function (req, res) {
	const dateString = req.params.date_string;
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return res.json({ error: "Invalid Date" });
	res.json({ unix: date.getTime(), utc: date.toUTCString() });
});

// ------------------------------ WhoAmI microservice ------------------------------

app.get("/api/whoami", function (req, res) {
	const ipaddress = req.ip;
	const language = req.header("Accept-Language");
	const software = req.header("User-Agent");
	res.json({ ipaddress, language, software });
});

// ------------------------------ URL shortener ------------------------------

const urlSchema = new mongoose.Schema({
	original_url: String,
	short_url: String,
});

const Url = mongoose.model("Url", urlSchema);

app.post("/api/shorturl/new/:url(*)", (req, res) => {
	const original_url = req.params.url;

	// Validate link
	const lookupUrl = original_url.replace(/^(https?:\/\/)|(www[.])/, "");
	dns.lookup(lookupUrl, (err) => {
		if (err) return res.json({ error: "invalid URL" });

		// Create short_url
		Url.find()
			.then((data) => {
				const short_url = data.length.toString();

				// Save doc in DB
				const doc = new Url({ original_url, short_url });
				doc
					.save()
					.then(() => {
						res.json({ original_url, short_url });
					})
					.catch((err) => {
						res.json({ error: "Database .save() failed: " + err });
					});
			})
			.catch((err) => {
				res.json({ error: "Database .find() failed: " + err });
			});
	});
});

app.get("/api/shorturl/:short_url", (req, res) => {
	// find url in DB
	const short_url = req.params.short_url.toString();
	console.log(short_url);
	Url.findOne({ short_url: short_url })
		.then((data) => {
			// redirect to original_url
			res.redirect(301, data.original_url);
		})
		.catch((err) => {
			res.json({ error: "Database .find() failed: " + err });
		});
});

// ------------------------------ Exercise Tracker ------------------------------

const userSchema = new mongoose.Schema({
	username: String,
	userId: String,
	count: Number,
	log: [
		{
			description: String,
			duration: Number,
			date: String,
		},
	],
});

const User = mongoose.model("User", userSchema);

// POST new user
app.post("/api/exercise/new-user", (req, res) => {
	const { username } = req.body;
	const newUser = new User({ username });
	newUser
		.save()
		.then((data) => {
			res.json({ username, _id: data._id });
		})
		.catch((err) => "Database error adding user: " + err);
});

// GET all users
app.get("/api/exercise/users", (req, res) => {
	User.find()
		.then((users) => {
			res.json(users);
		})
		.catch((err) => res.send(err));
});

// POST an exercise
app.post("/api/exercise/add", (req, res) => {
	let { userId, description, duration, date } = req.body;

	duration = parseInt(duration);
	if (date) date = new Date(date).toDateString();
	else date = new Date().toDateString();

	User.findById(userId, (error, user) => {
		if (error) return res.json({ error });
		user.log.push({
			description,
			duration,
			date,
		});
		user.save().then((user) => {
			res.json({
				username: user.username,
				_id: user._id,
				description,
				duration,
				date,
			});
		});
	});
});

// GET /api/exercise/log?{userId}[&from][&to][&limit]
app.get("/api/exercise/log", (req, res) => {
	let { userId, from, to, limit } = req.query;

	if (from) from = new Date(from).getTime();
	if (to) to = new Date(to).getTime();
	if (limit) limit = Number(limit);

	User.findById(userId)
		.then((user) => {
			const count = user.log.length;

			let log = user.log
				.filter((entry) => {
					const entryDate = new Date(entry.date).getTime();
					if (from && entryDate < from) return false;
					if (to && entryDate > to) return false;
					return true;
				})
				.map((entry) => ({
					description: entry.description,
					duration: entry.duration,
					date: entry.date,
				}));

			if (limit && count > limit) log.length = limit;

			res.json({
				userId: user._id,
				username: user.username,
				count,
				log,
			});
		})
		.catch((err) => res.json({ err }));
});

// ------------------------------ File Metadata ------------------------------

const multer = require("multer");

const upload = multer({ dest: "uploads/" });

app.post("/api/fileanalyse", upload.single("upfile"), (req, res) => {
	const name = req.file.originalname;
	const type = req.file.mimetype;
	const size = req.file.size;

	res.json({ name, type, size });
});

// {"name":".nojekyll","type":"application/octet-stream","size":0}

// ====================================================================

// Listen for requests
const listener = app.listen(process.env.PORT || 5000, function () {
	console.log("Your app is listening on port " + listener.address().port);
});
