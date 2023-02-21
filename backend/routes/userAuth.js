const router = require("express").Router();
const User = require("../models/user");
const { Product } = require("../models/product");
const { Payment } = require("../models/payment");
const bcrypt = require("bcryptjs");
const {
	registerValidation,
	loginValidation,
} = require("../validations/userValidation");
const jwt = require("jsonwebtoken");
const auth = require("../middlewares/auth");
const asnc = require("async");
router.route("/").get(auth, (req, res) => {
	res.send("whaup biatch");
	console.log("whats up motherfucker");
	console.log(req.user);
});

router.post("/register", async (req, res) => {
	console.log("this is body :", req.body);

	const { error } = registerValidation(req.body);

	// if (error) {
	// 	console.log(error);
	// 	return res.status(400).json(error.details[0].message);
	// }

	if (error)
		return res.status(400).send({
			message: error.details[0].message,
			type: error.details[0].path[0],
		});
	//	if (error) return res.status(400).send(error.details[0].message);

	//checkIf email already exists
	const emailExists = await User.findOne({ email: req.body.email });
	if (emailExists)
		return res
			.status(400)
			.send({ message: "email already exists", type: "email" });
	//   res.send(error);

	//hashing password
	const salt = await bcrypt.genSaltSync(10);
	const hashPassword = await bcrypt.hashSync(req.body.password, salt);

	const user = new User({
		name: req.body.name,
		email: req.body.email,
		password: hashPassword,
	});
	//console.log(user);

	// await user.save()
	//     .then((user) => res.send(user))
	//     .catch(err =>  res.status(400).send(err))

	await user
		.save()
		.then((user) => {
			//Signing jwt token
			jwt.sign(
				//payload : the thing we need to take in to verify token
				{ id: user._id },
				"SEcretKey",
				(err, token) => {
					if (err) res.status(400).send(err);
					else
						res.json({
							token,
							user,
						});
				}
			);
		})
		.catch((err) => res.status(400).send(err));
});

router.route("/login").post(async (req, res) => {
	//loginValidation
	const { error } = loginValidation(req.body);
	// if (error) return res.status(400).send(error.details[0].message);

	if (error)
		return res.status(400).send({
			message: error.details[0].message,
			type: error.details[0].path[0],
		});

	try {
		const user = await User.findOne({ email: req.body.email });
		if (!user)
			return res
				.status(400)
				.send({ message: "email doesn't  exist", type: "email" });

		//   res.send(error);

		const checkIf = await bcrypt.compareSync(req.body.password, user.password);
		if (!checkIf)
			return res
				.status(400)
				.send({ message: "password doesn't match", type: "password" });

		jwt.sign(
			//payload : the thing we need to take in to verify token
			{ id: user._id },
			"SEcretKey",
			(err, token) => {
				if (err) res.status(400).send(err);
				else
					res.json({
						token,
						user,
					});
			}
		);
	} catch (err) {
		res.status(400).send(err);
	}
});

//Checking if authorization works
router.get("/getinfo", auth, async (req, res) => {
	try {
		console.log("there you go");
		const user = await User.findById(req.user.id);

		if (!user) throw Error("User doesn't exist");
		res.json(user);
	} catch (e) {
		res.status(400).json({
			msg: e.message,
		});
	}
});
//http://localhost:5000/users/addToCart/product_by_id?id=${productId}

router.get("/addToCart", auth, async (req, res) => {
	//console.log(req.user.id);
	//console.log("gg", req.user.id);
	// console.log("id", req.user.id);
	// console.log("routeeexxx");
	//console.log("query id", req.query.id);
	await User.findOne({ _id: req.user.id })
		.then((userInfo) => {
			let flag = false;
			userInfo.cart.forEach((item) => {
				if (item.id == req.query.id) {
					flag = true;
				}
			});

			if (flag) {
				User.findOneAndUpdate(
					{ _id: req.user.id, "cart.id": req.query.id },
					{ $inc: { "cart.$.quantity": 1 } },
					{ new: true }
				)
					.then((userId) => {
						res.status(200).json(userId);
					})
					.catch((err) => {
						console.log(err);
					});
			} else {
				User.findOneAndUpdate(
					{ _id: req.user.id },
					{
						$push: {
							cart: {
								id: req.query.id,
								quantity: 1,
								date: Date.now(),
							},
						},
					},
					{ new: true }
				)
					.then((userId) => {
						res.status(200).json(userId);
					})
					.catch((err) => {
						console.log(err);
					});
			}
			//	res.status(200).json(userInfo);
		})
		.catch((err) => console.log(err));
});

//removeFromCart
//http://localhost:5000/users/removeFromCart?id=${productId}

router.get("/removeFromCart", auth, async (req, res) => {
	console.log("this is DB for rm");
	User.findOneAndUpdate(
		{ _id: req.user.id },
		{
			$pull: {
				cart: { id: req.query.id },
			},
		},
		{ new: true }
	)
		.then((userInfo) => {
			let cart = userInfo.cart;
			let array = cart.map((item) => {
				return item.id;
			});
			Product.find({ _id: { $in: array } }).exec((err, cartDetail) => {
				if (err) res.status(400).send(err);
				else
					res.status(200).json({
						cartDetail,
						cart,
					});
			});
		})
		.catch((err) => {
			console.log(err);
		});
});

router.post("/paymentSuccess", auth, async (req, res) => {
	console.log("paymentSucceeBackenddd");
	let history = [];
	let transactionDetails = {};

	//making history of user
	req.body.cartDetail.forEach((item) => {
		history.push({
			id: item._id,
			name: item.title,
			price: item.price,
			quantity: item.quantity,
			dataOfPurchase: Date.now(),
			paymentId: req.body.payment.paymentID,
		});
	});

	//Now making payment details as per the payment model

	transactionDetails.user = {
		id: req.user.id,
	};
	transactionDetails.data = req.body.payment;
	transactionDetails.product = history;

	//Now save it in the user database, push history and empty the cart

	await User.findOneAndUpdate(
		{
			_id: req.user.id,
		},
		{
			$push: { history: history },
			$set: { cart: [] },
		},
		{ new: true }
	)
		.then((user) => {
			const paymentDetails = new Payment(transactionDetails);
			paymentDetails
				.save()
				.then((doc) => {
					//now make  the sold varible of Product model

					// let products = [];
					// doc.product.forEach((item) => {
					// 	products.push({ id: item.id, quantity: item.quantity });

					// 	asnc.eachSeries(
					// 		products,
					// 		(it, callback) => {
					// 			Product.updateOne(
					// 				{
					// 					_id: it.id,
					// 				},
					// 				{
					// 					$inc: { sold: it.quantity },
					// 				},
					// 				{ new: false },
					// 				(err, updated) => {
					// 					if (err)
					// 						return res.status(400).json({ success: false, err });
					// 					return res.status(200).json({
					// 						success: true,
					// 						user: user,
					// 						cartDetail: [],
					// 					});
					// 				}
					// 			);
					// 		},
					// 		(err) => {
					// 			if (err) return res.status(400).json({ success: false, err });
					// 			return;
					// 		}
					// 	);
					// });

					return res.status(200).json({
						success: true,
						user: user,
						cartDetail: [],
					});
				})
				.catch((err) => {
					return res.status(400).json({ success: false, err });
				});
		})
		.catch((err) => {
			return res.status(400).json({ success: false, err });
		});
});
module.exports = router;
