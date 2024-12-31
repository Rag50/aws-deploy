const express = require('express')
const multer = require('multer')
const fs = require('fs')
const { exec } = require('child_process')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { transliterate } = require('transliteration');
const Sanscript = require("@indic-transliteration/sanscript")
const slug = require('slug');
const OpenAI = require('openai');
const { getFirestore, doc, setDoc, getDoc, updateDoc } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const { getAuth } = require("firebase-admin/auth");
const AWS = require('aws-sdk');
const temp = require('temp');
const { BlobServiceClient } = require('@azure/storage-blob');
const streamifier = require('streamifier');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const crypto = require("crypto");
const { Cashfree } = require("cashfree-pg");
dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI,
});

var serviceAccount = require("./caps-85254-firebase-adminsdk-31j3r-0edeb4bd98.json");


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const cron = require('node-cron');

const db = getFirestore();


const app = express();
app.use(cors());
app.use(express.json());



Cashfree.XClientId = process.env.CASHFREE_APPID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRETKEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;



const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORE);
const containerClient = blobServiceClient.getContainerClient('capsuservideos');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});


const upload = multer({ storage: storage });


async function uploadToAzure(filePath) {
    const blobName = path.basename(filePath);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const uploadBlobResponse = await blockBlobClient.uploadFile(filePath);
    return {
        url: blockBlobClient.url,
        blobName,
    };
}

// Helper function to delete file from Azure Blob Storage
async function deleteFromAzure(containerName, blobName) {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.delete();
    console.log(`Blob ${blobName} successfully deleted from container ${containerName}`);
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ai.editor@capsai.co',
        pass: process.env.EMAIL_KEY
    }
});

const emojiMapping = {
    "🐣": "ALLEMOJIS/AnimalFaces/BabyChick.png",
    "🐻": "ALLEMOJIS/AnimalFaces/Bear.png",
    "🐦": "ALLEMOJIS/AnimalFaces/Bird.png",
    "🐗": "ALLEMOJIS/AnimalFaces/Boar.png",
    "🐱": "ALLEMOJIS/AnimalFaces/CatFace.png",
    "🐔": "ALLEMOJIS/AnimalFaces/Chicken.png",
    "🐮": "ALLEMOJIS/AnimalFaces/CowFace.png",
    "🐶": "ALLEMOJIS/AnimalFaces/DogFace.png",
    "🐲": "ALLEMOJIS/AnimalFaces/DragonFace.png",
    "🦊": "ALLEMOJIS/AnimalFaces/Fox.png",
    "🐸": "ALLEMOJIS/AnimalFaces/Frog.png",
    "🐹": "ALLEMOJIS/AnimalFaces/Hamster.png",
    "🙉": "ALLEMOJIS/AnimalFaces/HearNoEvilMonkey.png",
    "🐴": "ALLEMOJIS/AnimalFaces/HorseFace.png",
    "🐨": "ALLEMOJIS/AnimalFaces/Koala.png",
    "🦁": "ALLEMOJIS/AnimalFaces/Lion.png",
    "🐵": "ALLEMOJIS/AnimalFaces/MonkeyFace1.png",
    "🦌": "ALLEMOJIS/AnimalFaces/Moose.png",
    "🐭": "ALLEMOJIS/AnimalFaces/MouseFace.png",
    "🐼": "ALLEMOJIS/AnimalFaces/Panda.png",
    "🐧": "ALLEMOJIS/AnimalFaces/Penguin.png",
    "🐷": "ALLEMOJIS/AnimalFaces/PigFace.png",
    "🐽": "ALLEMOJIS/AnimalFaces/PigNose.png",
    "🐻‍❄️": "ALLEMOJIS/AnimalFaces/PolarBear.png",
    "🐰": "ALLEMOJIS/AnimalFaces/RabbitFace.png",
    "🙈": "ALLEMOJIS/AnimalFaces/SeeNoEvilMonkey.png",
    "🙊": "ALLEMOJIS/AnimalFaces/SpeakNoEvilMonkey.png",
    "🐯": "ALLEMOJIS/AnimalFaces/TigerFace.png",
    "🦄": "ALLEMOJIS/AnimalFaces/Unicorn.png",
    "🐺": "ALLEMOJIS/AnimalFaces/Wolf.png",
    "🏦": "ALLEMOJIS/Buildings/Bank.png",
    "🏗️": "ALLEMOJIS/Buildings/BuildingConstruction.png",
    "🏰": "ALLEMOJIS/Buildings/Castle.png",
    "⛪": "ALLEMOJIS/Buildings/Church.png",
    "🏛️": "ALLEMOJIS/Buildings/ClassicalBuilding.png",
    "🏪": "ALLEMOJIS/Buildings/ConvenienceStore.png",
    "🏬": "ALLEMOJIS/Buildings/DepartmentStore.png",
    "🏚️": "ALLEMOJIS/Buildings/DerelictHouse.png",
    "🏭": "ALLEMOJIS/Buildings/Factory.png",
    "🏥": "ALLEMOJIS/Buildings/Hospital.png",
    "🏨": "ALLEMOJIS/Buildings/Hotel.png",
    "🏠": "ALLEMOJIS/Buildings/House.png",
    "🏘️": "ALLEMOJIS/Buildings/Houses.png",
    "🏡": "ALLEMOJIS/Buildings/HouseWithGarden.png",
    "🛖": "ALLEMOJIS/Buildings/Hut.png",
    "🏯": "ALLEMOJIS/Buildings/JapaneseCastle.png",
    "🏣": "ALLEMOJIS/Buildings/JapanesePostOffice.png",
    "🏩": "ALLEMOJIS/Buildings/LoveHotel.png",
    "🕌": "ALLEMOJIS/Buildings/Mosque.png",
    "🏢": "ALLEMOJIS/Buildings/OfficeBuilding.png",
    "🏤": "ALLEMOJIS/Buildings/PostOffice.png",
    "🏫": "ALLEMOJIS/Buildings/School.png",
    "🕍": "ALLEMOJIS/Buildings/Synagogue.png",
    "💒": "ALLEMOJIS/Buildings/Wedding.png",
    "🍼": "ALLEMOJIS/Drinks/BabyBottle.png",
    "🍺": "ALLEMOJIS/Drinks/BeerMug.png",
    "🥤": "ALLEMOJIS/Drinks/BeverageBox.png",
    "🍾": "ALLEMOJIS/Drinks/BottleWithPoppingCork.png",
    "🧋": "ALLEMOJIS/Drinks/BubbleTea.png",
    "🍻": "ALLEMOJIS/Drinks/ClinkingBeerMugs.png",
    "🥂": "ALLEMOJIS/Drinks/ClinkingGlasses.png",
    "🍸": "ALLEMOJIS/Drinks/CocktailGlass.png",
    "🥤": "ALLEMOJIS/Drinks/CupWithStraw.png",
    "🥛": "ALLEMOJIS/Drinks/GlassOfMilk().png",
    "☕": "ALLEMOJIS/Drinks/HotBeverage.png",
    "❄️": "ALLEMOJIS/Drinks/Ice.png",
    "🧉": "ALLEMOJIS/Drinks/Mate.png",
    "💧": "ALLEMOJIS/Drinks/PouringLiquid.png",
    "🍶": "ALLEMOJIS/Drinks/Sake.png",
    "🫖": "ALLEMOJIS/Drinks/TeacupWithoutHandle.png",
    "🍵": "ALLEMOJIS/Drinks/Teapot.png",
    "🍹": "ALLEMOJIS/Drinks/TropicalDrink.png",
    "🥃": "ALLEMOJIS/Drinks/TumblerGlass.png",
    "🍷": "ALLEMOJIS/Drinks/WineGlass.png",
    "🎈": "ALLEMOJIS/FestivitiesParty/Balloon.png",
    "🎄": "ALLEMOJIS/FestivitiesParty/ChristmasTree.png",
    "🚬": "ALLEMOJIS/FestivitiesParty/Cigarette.png",
    "🌂": "ALLEMOJIS/FestivitiesParty/ClosedUmbrella.png",
    "🎊": "ALLEMOJIS/FestivitiesParty/ConfettiBall.png",
    "🎃": "ALLEMOJIS/FestivitiesParty/JackOLantern.png",
    "🪁": "ALLEMOJIS/FestivitiesParty/Kite.png",
    "🪩": "ALLEMOJIS/FestivitiesParty/MirrorBall.png",
    "🎉": "ALLEMOJIS/FestivitiesParty/PartyPopper.png",
    "🪅": "ALLEMOJIS/FestivitiesParty/Pinata.png",
    "🧧": "ALLEMOJIS/FestivitiesParty/RedEnvelope.png",
    "🏮": "ALLEMOJIS/FestivitiesParty/RedPaperLantern.png",
    "✨": "ALLEMOJIS/FestivitiesParty/Sparkles.png",
    "☂️": "ALLEMOJIS/FestivitiesParty/Umbrella.png",
    "☔": "ALLEMOJIS/FestivitiesParty/UmbrellaWithRainDrops.png",
    "🎁": "ALLEMOJIS/FestivitiesParty/WrappedGift.png",
    "🎟️": "ALLEMOJIS/Fun/AdmissionTickets.png",
    "🎠": "ALLEMOJIS/Fun/CarouselHorse.png",
    "🎪": "ALLEMOJIS/Fun/CircusTent.png",
    "🔮": "ALLEMOJIS/Fun/CrystalBall.png",
    "🎡": "ALLEMOJIS/Fun/FerrisWheel.png",
    "🕋": "ALLEMOJIS/Fun/Kaaba.png",
    "🎭": "ALLEMOJIS/Fun/PerformingArts.png",
    "🛝": "ALLEMOJIS/Fun/PlaygroundSlide.png",
    "🛟": "ALLEMOJIS/Fun/RingBuoy.png",
    "🎢": "ALLEMOJIS/Fun/RollerCoaster.png",
    "🎰": "ALLEMOJIS/Fun/SlotMachine.png",
    "🧵": "ALLEMOJIS/Fun/Thread.png",
    "🎫": "ALLEMOJIS/Fun/Ticket.png",
    "⛱️": "ALLEMOJIS/Fun/UmbrellaOnGround.png",
    "🧶": "ALLEMOJIS/Fun/Yarn.png",
    "🏺": "ALLEMOJIS/Home/Amphora.png",
    "🧺": "ALLEMOJIS/Home/Basket.png",
    "🛁": "ALLEMOJIS/Home/Bathtub.png",
    "🛏️": "ALLEMOJIS/Home/Bed.png",
    "🛎️": "ALLEMOJIS/Home/BellhopBell.png",
    "🧹": "ALLEMOJIS/Home/Broom.png",
    "🪣": "ALLEMOJIS/Home/Bucket.png",
    "🕯️": "ALLEMOJIS/Home/Candle.png",
    "🪑": "ALLEMOJIS/Home/Chair.png",
    "🥢": "ALLEMOJIS/Home/Chopsticks.png",
    "📪": "ALLEMOJIS/Home/ClosedMailboxWithLoweredFlag.png",
    "🛋️": "ALLEMOJIS/Home/CouchAndLamp.png",
    "🪔": "ALLEMOJIS/Home/DiyaLamp.png",
    "🚪": "ALLEMOJIS/Home/Door.png",
    "🍴": "ALLEMOJIS/Home/ForkAndKnife-1.png",
    "🍴": "ALLEMOJIS/Home/ForkAndKnife.png",
    "🍽️": "ALLEMOJIS/Home/ForkAndKnifeWithPlate.png",
    "⛲": "ALLEMOJIS/Home/Fountain.png",
    "⚱️": "ALLEMOJIS/Home/FuneralUrn.png",
    "🧤": "ALLEMOJIS/Home/Gloves.png",
    "🪮": "ALLEMOJIS/Home/HairPick.png",
    "🫙": "ALLEMOJIS/Home/Jar.png",
    "🔪": "ALLEMOJIS/Home/KitchenKnife.png",
    "🪜": "ALLEMOJIS/Home/Ladder.png",
    "💄": "ALLEMOJIS/Home/Lipstick.png",
    "🧴": "ALLEMOJIS/Home/LotionBottle.png",
    "🪄": "ALLEMOJIS/Home/MagicWand.png",
    "🕰️": "ALLEMOJIS/Home/MantelpieceClock.png",
    "🪞": "ALLEMOJIS/Home/Mirror.png",
    "🪤": "ALLEMOJIS/Home/MouseTrap.png",
    "📰": "ALLEMOJIS/Home/Newspaper.png",
    "🗝️": "ALLEMOJIS/Home/OldKey.png",
    "📬": "ALLEMOJIS/Home/OpenMailboxWithLoweredFlag.png",
    "📭": "ALLEMOJIS/Home/OpenMailboxWithRaisedFlag.png",
    "🛌": "ALLEMOJIS/Home/PersonInBed.png",
    "🎍": "ALLEMOJIS/Home/PineDecoration.png",
    "🔫": "ALLEMOJIS/Home/Pistol.png",
    "🪠": "ALLEMOJIS/Home/Plunger.png",
    "📮": "ALLEMOJIS/Home/Postbox.png",
    "🚰": "ALLEMOJIS/Home/PotableWater.png",
    "🪒": "ALLEMOJIS/Home/Razor.png",
    "🗞️": "ALLEMOJIS/Home/RolledUpNewspaper.png",
    "🧻": "ALLEMOJIS/Home/RollOfPaper.png",
    "🚿": "ALLEMOJIS/Home/Shower.png",
    "❄️": "ALLEMOJIS/Home/Snowflake.png",
    "⛄": "ALLEMOJIS/Home/SnowmanWithoutSnow.png",
    "🧼": "ALLEMOJIS/Home/Soap.png",
    "🧽": "ALLEMOJIS/Home/Sponge.png",
    "🥄": "ALLEMOJIS/Home/Spoon.png",
    "🚽": "ALLEMOJIS/Home/Toilet.png",
    "🪥": "ALLEMOJIS/Home/Toothbrush.png",
    "🎐": "ALLEMOJIS/Home/WindChime.png",
    "🪟": "ALLEMOJIS/Home/Window.png",
    "🦡": "ALLEMOJIS/LandAnimals/Badger.png",
    "🦇": "ALLEMOJIS/LandAnimals/Bat.png",
    "🦫": "ALLEMOJIS/LandAnimals/Beaver.png",
    "🦬": "ALLEMOJIS/LandAnimals/Bison.png",
    "🐦‍⬛": "ALLEMOJIS/LandAnimals/BlackBird.png",
    "🐈‍⬛": "ALLEMOJIS/LandAnimals/BlackCat.png",
    "🐪": "ALLEMOJIS/LandAnimals/Camel.png",
    "🐈": "ALLEMOJIS/LandAnimals/Cat.png",
    "🐿️": "ALLEMOJIS/LandAnimals/Chipmunk.png",
    "🐄": "ALLEMOJIS/LandAnimals/Cow.png",
    "🐊": "ALLEMOJIS/LandAnimals/Crocodile.png",
    "🦌": "ALLEMOJIS/LandAnimals/Deer.png",
    "🦤": "ALLEMOJIS/LandAnimals/Dodo.png",
    "🐕": "ALLEMOJIS/LandAnimals/Dog.png",
    "🐕‍🦺": "ALLEMOJIS/LandAnimals/GuideDog.png",
    "🐩": "ALLEMOJIS/LandAnimals/ServiceDog.png",
    "🦄": "ALLEMOJIS/LandAnimals/Donkey.png",
    "🦢": "ALLEMOJIS/LandAnimals/Dove.png",
    "🐉": "ALLEMOJIS/LandAnimals/Dragon.png",
    "🦆": "ALLEMOJIS/LandAnimals/Duck.png",
    "🦅": "ALLEMOJIS/LandAnimals/Eagle.png",
    "🐘": "ALLEMOJIS/LandAnimals/Elephant.png",
    "🐑": "ALLEMOJIS/LandAnimals/Ewe.png",
    "🦩": "ALLEMOJIS/LandAnimals/Flamingo.png",
    "🐥": "ALLEMOJIS/LandAnimals/FrontFacingBabyChick.png",
    "🦒": "ALLEMOJIS/LandAnimals/Giraffe.png",
    "🐐": "ALLEMOJIS/LandAnimals/Goat.png",
    "🦢": "ALLEMOJIS/LandAnimals/Goose.png",
    "🦍": "ALLEMOJIS/LandAnimals/Gorilla.png",
    "🐣": "ALLEMOJIS/LandAnimals/HatchingChick.png",
    "🦔": "ALLEMOJIS/LandAnimals/Hedgehog.png",
    "🦛": "ALLEMOJIS/LandAnimals/Hippopotamus.png",
    "🐎": "ALLEMOJIS/LandAnimals/Horse.png",
    "🦘": "ALLEMOJIS/LandAnimals/Kangaroo.png",
    "🐆": "ALLEMOJIS/LandAnimals/Leopard.png",
    "🦎": "ALLEMOJIS/LandAnimals/Lizard.png",
    "🦙": "ALLEMOJIS/LandAnimals/Llama.png",
    "🦣": "ALLEMOJIS/LandAnimals/Mammoth.png",
    "🐒": "ALLEMOJIS/LandAnimals/Monkey.png",
    "🐁": "ALLEMOJIS/LandAnimals/Mouse.png",
    "🦧": "ALLEMOJIS/LandAnimals/Orangutan.png",
    "🦉": "ALLEMOJIS/LandAnimals/Owl.png",
    "🐂": "ALLEMOJIS/LandAnimals/Ox.png",
    "🦜": "ALLEMOJIS/LandAnimals/Parrot.png",
    "🦚": "ALLEMOJIS/LandAnimals/Peacock.png",
    "🐖": "ALLEMOJIS/LandAnimals/Pig.png",
    "🐩": "ALLEMOJIS/LandAnimals/Poodle.png",
    "🐇": "ALLEMOJIS/LandAnimals/Rabbit.png",
    "🦝": "ALLEMOJIS/LandAnimals/Raccoon.png",
    "🐏": "ALLEMOJIS/LandAnimals/Ram.png",
    "🐀": "ALLEMOJIS/LandAnimals/Rat.png",
    "🦏": "ALLEMOJIS/LandAnimals/Rhinoceros.png",
    "🐓": "ALLEMOJIS/LandAnimals/Rooster.png",
    "🦕": "ALLEMOJIS/LandAnimals/Sauropod.png",
    "🦨": "ALLEMOJIS/LandAnimals/Skunk.png",
    "🦥": "ALLEMOJIS/LandAnimals/Sloth.png",
    "🐌": "ALLEMOJIS/LandAnimals/Snail.png",
    "🐍": "ALLEMOJIS/LandAnimals/Snake.png",
    "🦖": "ALLEMOJIS/LandAnimals/TRex.png",
    "🧸": "ALLEMOJIS/LandAnimals/TeddyBear.png",
    "🐅": "ALLEMOJIS/LandAnimals/Tiger.png",
    "🦃": "ALLEMOJIS/LandAnimals/Turkey.png",
    "🐫": "ALLEMOJIS/LandAnimals/TwoHumpCamel.png",
    "🐃": "ALLEMOJIS/LandAnimals/WaterBuffalo.png",
    "🦓": "ALLEMOJIS/LandAnimals/Zebra.png",
    "🛕": "ALLEMOJIS/Monuments/HinduTemple.png",
    "🎎": "ALLEMOJIS/Monuments/JapaneseDolls.png",
    "🗿": "ALLEMOJIS/Monuments/Moai.png",
    "🪆": "ALLEMOJIS/Monuments/NestingDolls.png",
    "⛩️": "ALLEMOJIS/Monuments/ShintoShrine.png",
    "🗽": "ALLEMOJIS/Monuments/StatueOfLiberty.png",
    "🗼": "ALLEMOJIS/Monuments/TokyoTower.png",
    "🥋": "ALLEMOJIS/Offices/MartialArtsUniform.png",
    "⛷️": "ALLEMOJIS/Offices/Skier.png",
    "🏂": "ALLEMOJIS/Offices/Snowboarder.png",
    "🏋️": "ALLEMOJIS/Offices/WeightLifter.png",
    "🤼": "ALLEMOJIS/Offices/Wrestlers.png",
    "🤸": "ALLEMOJIS/Offices/PersonCartwheeling.png",
    "⛹️": "ALLEMOJIS/Offices/PersonBouncingBall.png",
    "🤾": "ALLEMOJIS/Offices/PersonPlayingHandball.png",
    "🏌️": "ALLEMOJIS/Offices/PersonGolfing.png",
    "🏇": "ALLEMOJIS/Offices/HorseRider.png",
    "🧗": "ALLEMOJIS/Offices/PersonClimbing.png",
    "🤺": "ALLEMOJIS/Offices/PersonFencing.png",
    "🤿": "ALLEMOJIS/Offices/DivingMask.png",
    "🏄": "ALLEMOJIS/Offices/PersonSurfing.png",
    "🏊": "ALLEMOJIS/Offices/PersonSwimming.png",
    "🤽": "ALLEMOJIS/Offices/PersonPlayingWaterPolo.png",
    "🚣": "ALLEMOJIS/Offices/PersonRowingBoat.png",
    "🧘": "ALLEMOJIS/Offices/PersonInLotusPosition.png",
    "🛀": "ALLEMOJIS/Offices/PersonTakingBath.png",
    "🛌": "ALLEMOJIS/Offices/PersonInBed.png",
    "🕴️": "ALLEMOJIS/Offices/PersonInSuitLevitating.png",
    "🗣️": "ALLEMOJIS/Offices/SpeakingHead.png",
    "👤": "ALLEMOJIS/Offices/BustInSilhouette.png",
    "👥": "ALLEMOJIS/Offices/BustsInSilhouette.png",
    "⛑️": "ALLEMOJIS/Offices/RescueWorkerHelmet.png",
    "🎓": "ALLEMOJIS/Offices/GraduationCap.png",
    "👑": "ALLEMOJIS/Offices/Crown.png",
    "🎩": "ALLEMOJIS/Offices/TopHat.png",
    "🎯": "ALLEMOJIS/Offices/DirectHit.png",
    "🎱": "ALLEMOJIS/Offices/8Ball.png",
    "🎮": "ALLEMOJIS/Offices/VideoGame.png",
    "🎰": "ALLEMOJIS/Offices/SlotMachine.png",
    "🎲": "ALLEMOJIS/Offices/GameDie.png",
    "🃏": "ALLEMOJIS/Offices/Joker.png",
    "🀄": "ALLEMOJIS/Offices/MahjongRedDragon.png",
    "🎴": "ALLEMOJIS/Offices/FlowerPlayingCards.png",
    "🎭": "ALLEMOJIS/Offices/PerformingArts.png",
    "🎨": "ALLEMOJIS/Offices/ArtistPalette.png",
    "🎯": "ALLEMOJIS/Offices/Bullseye.png",
    "🎵": "ALLEMOJIS/Offices/MusicalNote.png",
    "🎶": "ALLEMOJIS/Offices/MusicalNotes.png",
    "🎼": "ALLEMOJIS/Offices/MusicalScore.png",
    "🎤": "ALLEMOJIS/Offices/Microphone.png",
    "🎧": "ALLEMOJIS/Offices/Headphone.png",
    "🎷": "ALLEMOJIS/Offices/Saxophone.png",
    "🎸": "ALLEMOJIS/Offices/Guitar.png",
    "🎹": "ALLEMOJIS/Offices/MusicalKeyboard.png",
    "🎺": "ALLEMOJIS/Offices/Trumpet.png",
    "🎻": "ALLEMOJIS/Offices/Violin.png",
    "🥁": "ALLEMOJIS/Offices/Drum.png",
    "📱": "ALLEMOJIS/Offices/MobilePhone.png",
    "📲": "ALLEMOJIS/Offices/MobilePhoneWithArrow.png",
    "📲": "ALLEMOJIS/Offices/Calling.png",
    "📞": "ALLEMOJIS/Offices/TelephoneReceiver.png",
    "📟": "ALLEMOJIS/Offices/Pager.png",
    "📠": "ALLEMOJIS/Offices/FaxMachine.png",
    "🔋": "ALLEMOJIS/Offices/Battery.png",
    "🔌": "ALLEMOJIS/Offices/ElectricPlug.png",
    "💡": "ALLEMOJIS/Offices/LightBulb.png",
    "🔦": "ALLEMOJIS/Offices/Flashlight.png",
    "🕯️": "ALLEMOJIS/Offices/Candle.png",
    "🛢️": "ALLEMOJIS/Offices/OilDrum.png",
    "💸": "ALLEMOJIS/Offices/MoneyWithWings.png",
    "💵": "ALLEMOJIS/Offices/DollarBanknote.png",
    "💴": "ALLEMOJIS/Offices/YenBanknote.png",
    "💶": "ALLEMOJIS/Offices/EuroBanknote.png",
    "💷": "ALLEMOJIS/Offices/PoundBanknote.png",
    "💎": "ALLEMOJIS/Offices/GemStone.png",
    "⚖️": "ALLEMOJIS/Offices/BalanceScale.png",
    "🔗": "ALLEMOJIS/Offices/Link.png",
    "🔖": "ALLEMOJIS/Offices/Bookmark.png",
    "🧲": "ALLEMOJIS/Offices/Magnet.png",
    "🛒": "ALLEMOJIS/Offices/ShoppingCart.png",
    "🏧": "ALLEMOJIS/Offices/AutomatedTellerMachine.png",
    "🚮": "ALLEMOJIS/Offices/LitterInBinSign.png",
    "🚰": "ALLEMOJIS/Offices/PotableWater.png",
    "⚠️": "ALLEMOJIS/Offices/Warning.png",
    "Ⓜ️": "ALLEMOJIS/Offices/CircledM.png",
    "❌": "ALLEMOJIS/Offices/CrossMark.png",
    "⭕": "ALLEMOJIS/Offices/HeavyLargeCircle.png",
    "💯": "ALLEMOJIS/Offices/HundredPoints.png",
    "🔜": "ALLEMOJIS/Offices/SoonArrow.png",
    "🔙": "ALLEMOJIS/Offices/BackArrow.png",
    "🔛": "ALLEMOJIS/Offices/OnArrow.png",
    "©️": "ALLEMOJIS/Offices/Copyright.png",
    "®️": "ALLEMOJIS/Offices/Registered.png",
    "™️": "ALLEMOJIS/Offices/TradeMark.png",
    "🫱🏻‍🫲🏻": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Light-Skin-Tone-1.png",
    "🫱🏻‍🫲🏼": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Light-Skin-Tone-2.png",
    "🫱🏻‍🫲🏽": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Light-Skin-Tone-3.png",
    "🫱🏻‍🫲🏾": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Light-Skin-Tone-4.png",
    "🫱🏻‍🫲🏿": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Light-Skin-Tone-5.png",
    "🫱🏼‍🫲🏻": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Skin-Tone-1.png",
    "🫱🏼‍🫲🏼": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Skin-Tone-2.png",
    "🫱🏼‍🫲🏽": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Skin-Tone-3.png",
    "🫱🏼‍🫲🏾": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Skin-Tone-4.png",
    "🫱🏼‍🫲🏿": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Skin-Tone-5.png",
    "🫱🏽‍🫲🏻": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Dark-Skin-Tone-1.png",
    "🫱🏽‍🫲🏼": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Dark-Skin-Tone-2.png",
    "🫱🏽‍🫲🏽": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Dark-Skin-Tone-3.png",
    "🫱🏽‍🫲🏾": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Dark-Skin-Tone-4.png",
    "🫱🏽‍🫲🏿": "ALLEMOJIS/Romantic/Skin-Tone-Medium-Dark-Skin-Tone-5.png",
    "🫱🏾‍🫲🏻": "ALLEMOJIS/Romantic/Skin-Tone-Dark-Skin-Tone-1.png",
    "🫱🏾‍🫲🏼": "ALLEMOJIS/Romantic/Skin-Tone-Dark-Skin-Tone-2.png",
    "🫱🏾‍🫲🏽": "ALLEMOJIS/Romantic/Skin-Tone-Dark-Skin-Tone-3.png",
    "🫱🏾‍🫲🏾": "ALLEMOJIS/Romantic/Skin-Tone-Dark-Skin-Tone-4.png",
    "🫱🏾‍🫲🏿": "ALLEMOJIS/Romantic/Skin-Tone-Dark-Skin-Tone-5.png",
    "🫱🏿‍🫲🏻": "ALLEMOJIS/Romantic/Skin-Tone-1.png",
    "🫱🏿‍🫲🏼": "ALLEMOJIS/Romantic/Skin-Tone-2.png",
    "🫱🏿‍🫲🏽": "ALLEMOJIS/Romantic/Skin-Tone-3.png",
    "🫱🏿‍🫲🏾": "ALLEMOJIS/Romantic/Skin-Tone-4.png",
    "🫱🏿‍🫲🏿": "ALLEMOJIS/Romantic/Skin-Tone-5.png",
    "🤝🏻": "ALLEMOJIS/Romantic/Handshake-Light-Skin-Tone.png",
    "🤝🏼": "ALLEMOJIS/Romantic/Handshake-Medium-Light-Skin-Tone.png",
    "🤝🏽": "ALLEMOJIS/Romantic/Handshake-Medium-Skin-Tone.png",
    "🤝🏾": "ALLEMOJIS/Romantic/Handshake-Medium-Dark-Skin-Tone.png",
    "🤝🏿": "ALLEMOJIS/Romantic/Handshake-Dark-Skin-Tone.png",
    "💏🏻": "ALLEMOJIS/Romantic/KissPersonWithMedium-LightSkinTone.png",
    "💏🏼": "ALLEMOJIS/Romantic/KissPersonWithMediumSkinTone.png",
    "💏🏽": "ALLEMOJIS/Romantic/KissPersonWithMedium-DarkSkinTone.png",
    "💏🏾": "ALLEMOJIS/Romantic/KissPersonWithDarkSkinTone.png",
    "💏🏿": "ALLEMOJIS/Romantic/KissPersonWithMedium-LightSkinTone-2.png",
    "👨‍❤️‍💋‍👩🏼": "ALLEMOJIS/Romantic/KissManWomanMedium-DarkSkinTone.png",
    "👩‍❤️‍💋‍👨🏼": "ALLEMOJIS/Romantic/KissWomanManDarkSkinTone.png",
    "👩‍❤️‍💋‍👨🏿": "ALLEMOJIS/Romantic/KissWomanManMediumSkinTone.png",
    "👩‍❤️‍💋‍👨🏾": "ALLEMOJIS/Romantic/KissWomanManMediumLightSkinTone.png",
    "👨‍👨‍👦🏼": "ALLEMOJIS/Romantic/FamilyManManBoyMediumLightSkinTone.png",
    "👨‍👨‍👦🏽": "ALLEMOJIS/Romantic/FamilyManManBoyMediumSkinTone.png",
    "👨‍👨‍👦🏾": "ALLEMOJIS/Romantic/FamilyManManBoyMedium-DarkSkinTone.png",
    "👨‍👨‍👦🏿": "ALLEMOJIS/Romantic/FamilyManManBoyDarkSkinTone.png",
    "👩‍❤️‍👨🏻": "ALLEMOJIS/Romantic/CoupleWithHeartWomanManLightSkinTone.png",
    "💋": "ALLEMOJIS/Romantic/Kiss.png",
    "👨‍❤️‍👨": "ALLEMOJIS/Romantic/CoupleWithHeartManManDarkSkinTone.png",
    "💑": "ALLEMOJIS/Romantic/CoupleWithHeart.png",
    "💋": "ALLEMOJIS/Romantic/Kiss-1.png",
    "🥇": "ALLEMOJIS/SportsEquipment/1stPlaceMedal.png",
    "🥈": "ALLEMOJIS/SportsEquipment/2ndPlaceMedal.png",
    "🥉": "ALLEMOJIS/SportsEquipment/3rdPlaceMedal.png",
    "⚓": "ALLEMOJIS/SportsEquipment/Anchor.png",
    "🎨": "ALLEMOJIS/SportsEquipment/ArtistPalette.png",
    "🏸": "ALLEMOJIS/SportsEquipment/Badminton.png",
    "🏹": "ALLEMOJIS/SportsEquipment/BowAndArrow.png",
    "🥊": "ALLEMOJIS/SportsEquipment/BoxingGlove.png",
    "🛶": "ALLEMOJIS/SportsEquipment/Canoe.png",
    "♟️": "ALLEMOJIS/SportsEquipment/ChessPawn.png",
    "🏏": "ALLEMOJIS/SportsEquipment/CricketGame.png",
    "🥌": "ALLEMOJIS/SportsEquipment/CurlingStone.png",
    "🎯": "ALLEMOJIS/SportsEquipment/DirectHit.png",
    "🤿": "ALLEMOJIS/SportsEquipment/DivingMask.png",
    "🏑": "ALLEMOJIS/SportsEquipment/FieldHockey.png",
    "🎣": "ALLEMOJIS/SportsEquipment/FishingPole.png",
    "⛳": "ALLEMOJIS/SportsEquipment/FlagInHole.png",
    "🥏": "ALLEMOJIS/SportsEquipment/FlyingDisc.png",
    "🎲": "ALLEMOJIS/SportsEquipment/GameDie.png",
    "🥅": "ALLEMOJIS/SportsEquipment/GoalNet.png",
    "🏒": "ALLEMOJIS/SportsEquipment/IceHockey.png",
    "⛸️": "ALLEMOJIS/SportsEquipment/IceSkate.png",
    "🥍": "ALLEMOJIS/SportsEquipment/Lacrosse.png",
    "🥋": "ALLEMOJIS/SportsEquipment/MartialArtsUniform.png",
    "🎖️": "ALLEMOJIS/SportsEquipment/MilitaryMedal.png",
    "🩱": "ALLEMOJIS/SportsEquipment/OnePieceSwimsuit.png",
    "🏓": "ALLEMOJIS/SportsEquipment/PingPong.png",
    "🎱": "ALLEMOJIS/SportsEquipment/Pool8Ball.png",
    "🧩": "ALLEMOJIS/SportsEquipment/PuzzlePiece.png",
    "🎗️": "ALLEMOJIS/SportsEquipment/ReminderRibbon.png",
    "🛼": "ALLEMOJIS/SportsEquipment/RollerSkate.png",
    "🎽": "ALLEMOJIS/SportsEquipment/RunningShirt.png",
    "🛹": "ALLEMOJIS/SportsEquipment/Skateboard.png",
    "🎿": "ALLEMOJIS/SportsEquipment/Skis.png",
    "🛷": "ALLEMOJIS/SportsEquipment/Sled.png",
    "🏅": "ALLEMOJIS/SportsEquipment/SportsMedal.png",
    "🏆": "ALLEMOJIS/SportsEquipment/Trophy.png",
    "🎮": "ALLEMOJIS/SportsEquipment/VideoGame.png",
    "🪀": "ALLEMOJIS/SportsEquipment/YoYo.png",
    "🔋": "ALLEMOJIS/Technologicalequipment/Battery.png",
    "📷": "ALLEMOJIS/Technologicalequipment/Camera.png",
    "📸": "ALLEMOJIS/Technologicalequipment/CameraWithFlash.png",
    "📇": "ALLEMOJIS/Technologicalequipment/CardIndex.png",
    "🎬": "ALLEMOJIS/Technologicalequipment/ClapperBoard.png",
    "💽": "ALLEMOJIS/Technologicalequipment/ComputerDisk.png",
    "🖱️": "ALLEMOJIS/Technologicalequipment/ComputerMouse.png",
    "🎛️": "ALLEMOJIS/Technologicalequipment/ControlKnobs.png",
    "🖥️": "ALLEMOJIS/Technologicalequipment/DesktopComputer.png",
    "🔌": "ALLEMOJIS/Technologicalequipment/ElectricPlug.png",
    "📠": "ALLEMOJIS/Technologicalequipment/FaxMachine.png",
    "🎞️": "ALLEMOJIS/Technologicalequipment/FilmFrames.png",
    "📽️": "ALLEMOJIS/Technologicalequipment/FilmProjector.png",
    "🔦": "ALLEMOJIS/Technologicalequipment/Flashlight.png",
    "💾": "ALLEMOJIS/Technologicalequipment/FloppyDisk.png",
    "🕹️": "ALLEMOJIS/Technologicalequipment/Joystick.png",
    "⌨️": "ALLEMOJIS/Technologicalequipment/Keyboard.png",
    "💻": "ALLEMOJIS/Technologicalequipment/Laptop.png",
    "🎚️": "ALLEMOJIS/Technologicalequipment/LevelSlider.png",
    "💡": "ALLEMOJIS/Technologicalequipment/LightBulb.png",
    "📢": "ALLEMOJIS/Technologicalequipment/Loudspeaker.png",
    "🔋": "ALLEMOJIS/Technologicalequipment/LowBattery.png",
    "📣": "ALLEMOJIS/Technologicalequipment/Megaphone.png",
    "📱": "ALLEMOJIS/Technologicalequipment/MobilePhone.png",
    "📲": "ALLEMOJIS/Technologicalequipment/MobilePhoneWithArrow.png",
    "🎥": "ALLEMOJIS/Technologicalequipment/MovieCamera.png",
    "📟": "ALLEMOJIS/Technologicalequipment/Pager.png",
    "🖨️": "ALLEMOJIS/Technologicalequipment/Printer.png",
    "📻": "ALLEMOJIS/Technologicalequipment/Radio.png",
    "📡": "ALLEMOJIS/Technologicalequipment/SatelliteAntenna.png",
    "🩺": "ALLEMOJIS/Technologicalequipment/Stethoscope.png",
    "☎️": "ALLEMOJIS/Technologicalequipment/Telephone.png",
    "📞": "ALLEMOJIS/Technologicalequipment/TelephoneReceiver.png",
    "📺": "ALLEMOJIS/Technologicalequipment/Television.png",
    "⏲️": "ALLEMOJIS/Technologicalequipment/TimerClock.png",
    "🖲️": "ALLEMOJIS/Technologicalequipment/Trackball.png",
    "📹": "ALLEMOJIS/Technologicalequipment/VideoCamera.png",
    "📼": "ALLEMOJIS/Technologicalequipment/Videocassette.png",
    "⌚": "ALLEMOJIS/Technologicalequipment/Watch.png",
    "🚡": "ALLEMOJIS/Vehicles/AerialTramway.png",
    "✈️": "ALLEMOJIS/Vehicles/Airplane.png",
    "🛬": "ALLEMOJIS/Vehicles/AirplaneArrival.png",
    "🛫": "ALLEMOJIS/Vehicles/AirplaneDeparture.png",
    "🚑": "ALLEMOJIS/Vehicles/Ambulance.png",
    "🚛": "ALLEMOJIS/Vehicles/ArticulatedLorry.png",
    "🚗": "ALLEMOJIS/Vehicles/Automobile.png",
    "🛺": "ALLEMOJIS/Vehicles/AutoRickshaw.png",
    "🚲": "ALLEMOJIS/Vehicles/Bicycle.png",
    "🚄": "ALLEMOJIS/Vehicles/BulletTrain.png",
    "🚌": "ALLEMOJIS/Vehicles/Bus.png",
    "🚚": "ALLEMOJIS/Vehicles/DeliveryTruck.png",
    "⛴️": "ALLEMOJIS/Vehicles/Ferry.png",
    "🚒": "ALLEMOJIS/Vehicles/FireEngine.png",
    "🛸": "ALLEMOJIS/Vehicles/FlyingSaucer.png",
    "🚁": "ALLEMOJIS/Vehicles/Helicopter.png",
    "🚅": "ALLEMOJIS/Vehicles/HighSpeedTrain.png",
    "🛴": "ALLEMOJIS/Vehicles/KickScooter.png",
    "🚈": "ALLEMOJIS/Vehicles/LightRail.png",
    "🚂": "ALLEMOJIS/Vehicles/Locomotive.png",
    "🦽": "ALLEMOJIS/Vehicles/ManualWheelchair.png",
    "🚇": "ALLEMOJIS/Vehicles/Metro.png",
    "🚐": "ALLEMOJIS/Vehicles/Minibus.png",
    "🚝": "ALLEMOJIS/Vehicles/Monorail.png",
    "🚤": "ALLEMOJIS/Vehicles/MotorBoat.png",
    "🏍️": "ALLEMOJIS/Vehicles/Motorcycle.png",
    "🦼": "ALLEMOJIS/Vehicles/MotorizedWheelchair.png",
    "🛵": "ALLEMOJIS/Vehicles/MotorScooter.png",
    "🚠": "ALLEMOJIS/Vehicles/MountainCableway.png",
    "🚞": "ALLEMOJIS/Vehicles/MountainRailway.png",
    "🚘": "ALLEMOJIS/Vehicles/OncomingAutomobile.png",
    "🚍": "ALLEMOJIS/Vehicles/OncomingBus.png",
    "🚔": "ALLEMOJIS/Vehicles/OncomingPoliceCar.png",
    "🚖": "ALLEMOJIS/Vehicles/OncomingTaxi.png",
    "🛳️": "ALLEMOJIS/Vehicles/PassengerShip.png",
    "🛻": "ALLEMOJIS/Vehicles/PickupTruck.png",
    "🚓": "ALLEMOJIS/Vehicles/PoliceCar.png",
    "🏎️": "ALLEMOJIS/Vehicles/RacingCar.png",
    "🚃": "ALLEMOJIS/Vehicles/RailwayCar.png",
    "🚀": "ALLEMOJIS/Vehicles/Rocket.png",
    "⛵": "ALLEMOJIS/Vehicles/Sailboat.png",
    "💺": "ALLEMOJIS/Vehicles/Seat.png",
    "🚢": "ALLEMOJIS/Vehicles/Ship.png",
    "🛩️": "ALLEMOJIS/Vehicles/SmallAirplane.png",
    "🚤": "ALLEMOJIS/Vehicles/Speedboat.png",
    "🚙": "ALLEMOJIS/Vehicles/SportUtilityVehicle.png",
    "🚉": "ALLEMOJIS/Vehicles/Station.png",
    "🚟": "ALLEMOJIS/Vehicles/SuspensionRailway.png",
    "🚕": "ALLEMOJIS/Vehicles/Taxi.png",
    "🚜": "ALLEMOJIS/Vehicles/Tractor.png",
    "🚆": "ALLEMOJIS/Vehicles/Train.png",
    "🚋": "ALLEMOJIS/Vehicles/Tram.png",
    "🚞": "ALLEMOJIS/Vehicles/TramCar.png",
    "🚎": "ALLEMOJIS/Vehicles/Trolleybus.png",
    "🥯": "ALLEMOJIS/Bakery/Bagel.png",
    "🥖": "ALLEMOJIS/Bakery/BaguetteBread.png",
    "🍞": "ALLEMOJIS/Bakery/Bread.png",
    "🧈": "ALLEMOJIS/Bakery/Butter.png",
    "🧀": "ALLEMOJIS/Bakery/CheeseWedge.png",
    "🥐": "ALLEMOJIS/Bakery/Croissant.png",
    "🥠": "ALLEMOJIS/Bakery/FortuneCookie.png",
    "🥪": "ALLEMOJIS/Bakery/Sandwich.png",
    "🥙": "ALLEMOJIS/Bakery/StuffedFlatbread.png",
    "👾": "ALLEMOJIS/Smileys/AlienMonster.png",
    "😠": "ALLEMOJIS/Smileys/AngryFaceWithHorns.png",
    "😟": "ALLEMOJIS/Smileys/AnguishedFace.png",
    "😰": "ALLEMOJIS/Smileys/AnxiousFaceWithSweat.png",
    "😲": "ALLEMOJIS/Smileys/AstonishedFace.png",
    "😁": "ALLEMOJIS/Smileys/BeamingFaceWithSmilingEyes.png",
    "😹": "ALLEMOJIS/Smileys/CatWithTearsOfJoy.png",
    "😼": "ALLEMOJIS/Smileys/CatWithWrySmile.png",
    "😕": "ALLEMOJIS/Smileys/ConfusedFace.png",
    "😞": "ALLEMOJIS/Smileys/DisappointedFace.png",
    "🥸": "ALLEMOJIS/Smileys/DisguisedFace.png",
    "😓": "ALLEMOJIS/Smileys/DowncastFaceWithSweat.png",
    "😑": "ALLEMOJIS/Smileys/ExpressionlessFace.png",
    "😚": "ALLEMOJIS/Smileys/FaceBlowingAKiss.png",
    "🥲": "ALLEMOJIS/Smileys/FaceHoldingBackTears.png",
    "😶‍🌫️": "ALLEMOJIS/Smileys/FaceInClouds.png",
    "😋": "ALLEMOJIS/Smileys/FaceSavoringFood.png",
    "😱": "ALLEMOJIS/Smileys/FaceScreamingInFear.png",
    "😷": "ALLEMOJIS/Smileys/FaceWithMedicalMask.png",
    "🤨": "ALLEMOJIS/Smileys/FaceWithRaisedEyebrow.png",
    "🙄": "ALLEMOJIS/Smileys/FaceWithRollingEyes.png",
    "🌀": "ALLEMOJIS/Smileys/FaceWithSpiralEyes.png",
    "😤": "ALLEMOJIS/Smileys/FaceWithSteamFromNose.png",
    "🤐": "ALLEMOJIS/Smileys/FaceWithSymbolsOnMouth.png",
    "😭": "ALLEMOJIS/Smileys/FaceWithTearsOfJoy.png",
    "😳": "ALLEMOJIS/Smileys/FlushedFace.png",
    "👻": "ALLEMOJIS/Smileys/Ghost1.png",
    "😺": "ALLEMOJIS/Smileys/GrinningCatWithSmilingEyes.png",
    "😃": "ALLEMOJIS/Smileys/GrinningFaceWithBigEyes.png",
    "😀": "ALLEMOJIS/Smileys/GrinningFaceWithSmilingEyes.png",
    "😅": "ALLEMOJIS/Smileys/GrinningFaceWithSweat.png",
    "😆": "ALLEMOJIS/Smileys/GrinningSquintingFace.png",
    "😯": "ALLEMOJIS/Smileys/HushedFace.png",
    "😽": "ALLEMOJIS/Smileys/KissingCat.png",
    "😗": "ALLEMOJIS/Smileys/KissingFace.png",
    "😚": "ALLEMOJIS/Smileys/KissingFaceWithClosedEyes.png",
    "😘": "ALLEMOJIS/Smileys/KissingFaceWithSmilingEyes.png",
    "🤢": "ALLEMOJIS/Smileys/NauseatedFace.png",
    "🤔": "ALLEMOJIS/Smileys/PensiveFace.png",
    "🤗": "ALLEMOJIS/Smileys/PerseveringFace.png",
    "😢": "ALLEMOJIS/Smileys/SadButRelievedFace.png",
    "🫡": "ALLEMOJIS/Smileys/SalutingFace.png",
    "🤝": "ALLEMOJIS/Smileys/ShakingFace.png",
    "🤫": "ALLEMOJIS/Smileys/ShushingFace.png",
    "💀": "ALLEMOJIS/Smileys/Skull.png",
    "☠️": "ALLEMOJIS/Smileys/SkullAndCrossbones.png",
    "😴": "ALLEMOJIS/Smileys/SleepingFace.png",
    "🙁": "ALLEMOJIS/Smileys/SlightlyFrowningFace.png",
    "🙂": "ALLEMOJIS/Smileys/SlightlySmilingFace.png",
    "😻": "ALLEMOJIS/Smileys/SmilingCatWithHeartEyes.png",
    "😊": "ALLEMOJIS/Smileys/SmilingFace.png",
    "😇": "ALLEMOJIS/Smileys/SmilingFaceWithHalo.png",
    "😍": "ALLEMOJIS/Smileys/SmilingFaceWithHeartEyes.png",
    "🥰": "ALLEMOJIS/Smileys/SmilingFaceWithHearts.png",
    "😈": "ALLEMOJIS/Smileys/SmilingFaceWithHorns.png",
    "😎": "ALLEMOJIS/Smileys/SmilingFaceWithSunglasses.png",
    "😢": "ALLEMOJIS/Smileys/SmilingFaceWithTear.png",
    "😏": "ALLEMOJIS/Smileys/SmirkingFace.png",
    "🤧": "ALLEMOJIS/Smileys/SneezingFace.png",
    "😛": "ALLEMOJIS/Smileys/SquintingFaceWithTongue.png",
    "🤩": "ALLEMOJIS/Smileys/StarStruck.png",
    "😑": "ALLEMOJIS/Smileys/UnamusedFace.png",
    "🙃": "ALLEMOJIS/Smileys/UpsideDownFace.png"
}


app.post('/api/process-video', upload.single('video'), async (req, res) => {
    try {
        console.log(req)
        const videoPath = req.file.path;
        const language = req.body.SelectedLang;
        const isoneWord = req.body.WordLimit === 'true';
        console.log(isoneWord, "from front");
        let remaningmins = 0;
        const outputPath = `${videoPath}_output.mp4`;
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');

        const transcription = await transcribeVideo(videoPath, isoneWord);
        console.log(transcription, "process wali")

        let srtContent

        if (isoneWord) {
            srtContent = generateSRTSimple(transcription.words)
        } else {
            console.log("Ran");
            srtContent = processTranscriptionToSRT(transcription.segments, 4);
        }

        console.log(srtContent)
        let outputSrt;


        const directLanguages = ["English", "Hindi"];
        const supportedLanguages = ["Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Punjabi"];


        if (directLanguages.includes(language) && transcription.language.toLowerCase() === language.toLowerCase()) {
            outputSrt = srtContent;
        } else if (supportedLanguages.includes(language)) {
            outputSrt = srtContent;
        } else {
            outputSrt = await convertHindiToHinglish(srtContent, language);
        }



        const srtFilePath = path.join(__dirname, 'uploads', `${req.file.filename.replace('.mp4', '')}.srt`);
        fs.writeFileSync(srtFilePath, outputSrt);




        // Upload video and SRT to azure

        const videoUpload = await uploadToAzure(videoPath);
        const srtUpload = await uploadToAzure(srtFilePath);
        console.log(videoUpload, srtUpload)


        fs.unlinkSync(videoPath);
        fs.unlinkSync(srtFilePath);


        res.json({
            transcription: formatSubtitle(outputSrt),
            rawData: transcription.words,
            inputFile: videoUpload.url,
            lang: transcription.language,
            key: videoUpload.blobName,
            srt: srtUpload.url,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/change-style', upload.single('video'), async (req, res) => {
    try {
        const { inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize, userdata, uid, save, keyS3, transcriptions, isOneword, videoResolution, soundEffects } = req.body;
        if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize || !userdata || !uid) {
            return res.status(400).json({ error: 'Missing required fields in the request body' });
        }
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.png');
        const tempassFile = path.join(__dirname, 'watermarks', 'temp.ass');
        const videoPath = inputVideo;
        const srtFilePath = path.join(__dirname, 'uploads', `${path.basename(srtUrl)}`);
        const srtResponse = await axios.get(srtUrl);
        fs.writeFileSync(srtFilePath, srtResponse.data);
        const srtContent = generateSRT(transcriptions);
        let assContent = isOneword ? convertSrtToAssWordByWord(srtContent, font, color, yPosition) : convertSrtToAssWordByWord(srtContent, font, color, yPosition, 4);
        const assFilePath = path.join(__dirname, 'uploads', 'subtitles.ass');
        fs.writeFileSync(assFilePath, assContent);
        const tempOutputPath = temp.path({ suffix: '.mp4' });


        let remaningmins = 0;

        let modifedInput = await VideoEmojiprocessing(assFilePath, videoPath, watermarkPath);
        const inputs = [modifedInput];


        let soundEffectTimestamp = 5000;
        const videoStreamIndex = 0;
        const watermarkStreamIndex = 1;
        const soundEffectStartIndex = watermarkPath ? 2 : 1;



        if (watermarkPath) inputs.push(watermarkPath);

        // Handle sound effect inputs and filters only if there are sound effects
        const soundEffectInputs = soundEffects.length > 0 ? soundEffects.map(effect => `-i ${effect.file}`).join(' ') : '';
        const soundEffectFilters = soundEffects.length > 0
            ? soundEffects.map((effect, index) =>
                `[${soundEffectStartIndex + index}:a]adelay=${effect.timestamp}|${effect.timestamp}[sfx${index}]`
            ).join('; ') : '';  // If no sound effects, this will be empty

        const audioMixFilters = soundEffects.length > 0
            ? `[${videoStreamIndex}:a]${soundEffects.map((_, index) => `[sfx${index}]`).join('')}amix=inputs=${soundEffects.length + 1}:duration=first[audioMix]`
            : `[0:a][0:a]amix=inputs=2[audioMix]`;  // If no sound effects, just mix the original audio stream

        let ffmpegCommand;
        const outputFilePath = path.join(__dirname, 'uploads', path.basename(videoPath).replace('.mp4', '_output.mp4'));

        // Correctly structure the ffmpeg command to handle all scenarios
        await new Promise((resolve, reject) => {
            if (userdata.usertype === 'free') {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `[${watermarkStreamIndex}:v]scale=150:70[watermark]; ` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setdar=16/9[scaled]; ` +
                        `[scaled][watermark]overlay=700:190,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else if (videoResolution === '1:1') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `[${watermarkStreamIndex}:v]scale=150:70[watermark]; ` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,setdar=1/1[scaled]; ` +
                        `[scaled][watermark]overlay=400:158,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `[${watermarkStreamIndex}:v]scale=203.2:94.832[watermark]; ` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v][watermark]overlay=494:310,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                }
            } else {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setdar=16/9,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else if (videoResolution === '1:1') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,setdar=1/1,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                }
            }





            exec(ffmpegCommand, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });


        let outputUpload
        let outputVideoUrl



        if (save) {

            // Upload output video to S3
            // outputUpload = await uploadToS3(outputFilePath, 'capsuservideos');
            // outputVideoUrl = outputUpload.Location;
            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;
            // Schedule deletion based on user type
            if (userdata.usertype === 'free') {
                scheduleFileDeletion('capsuservideos', keyS3, 5)
                scheduleFileDeletion('capsuservideos', outputUpload.blobName, 2);
            } else {
                scheduleFileDeletion('capsuservideos', keyS3, 2)
                scheduleFileDeletion('capsuservideos', outputUpload.blobName, 2);
            }

            // Delete the input video
            // await deleteFromS3(videoPath, 'capsuservideos');

            const videos = userdata.videos || [];


            const newDocRef = await db.collection('users').doc(uid).collection('videos').add({
                videoUrl: videoPath,
                srt: srtUrl,
                fontadded: font,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                key: keyS3,
                transcriptions: transcriptions
            });
            const docId = newDocRef.id;
            const docPath = `users/${uid}/videos`
            if (userdata.usertype === 'free') {
                scheduleDocumentDeletion(docPath, docId, 2)
            } else {
                scheduleDocumentDeletion(docPath, docId, 3)
            }

        } else {

            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;

            scheduleFileDeletion('capsuservideos', outputUpload.blobName, 1);

            scheduleFileDeletion('capsuservideos', keyS3, 6)


            // await deleteFromS3(videoPath, 'capsuservideos');
        }


        const videoDuration = await getVideoDuration(videoPath);


        if (userdata.usertype === 'free') {
            if (videoDuration > 3) {
                return res.status(400).json({ error: 'Video length exceeds 3 minutes limit for free users' });
            }
            else {
                console.log(userdata.videomins, 'user mins');
                console.log(videoDuration, 'dur');
                remaningmins = userdata.videomins - videoDuration;
                console.log(remaningmins);
            }
        } else {
            remaningmins = userdata.videomins - videoDuration;
        }

        const userRef = db.collection('users').doc(uid);
        let exact;
        if (remaningmins <= 0) {
            exact = 0;
        } else {
            exact = remaningmins.toFixed(1);
        }

        console.log(exact, "rounded")
        await userRef.update({
            videomins: exact,
        });


        fs.unlinkSync(srtFilePath)
        fs.unlinkSync(assFilePath)
        fs.unlinkSync(outputFilePath)
        fs.unlinkSync(modifedInput)

        res.json({ videoUrl: outputVideoUrl });
    } catch (error) {
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }
});


app.get("/api/payment", async (req, res) => {
    console.log('its in payment')
    try {
        const orderAmount = req.query.order_amount || 0;
        const customer_id = req.query.customer_id;
        const customer_name = req.query.customer_name;
        const customer_email = req.query.customer_email;
        console.log(orderAmount, customer_id, customer_name, customer_email)
        let request = {
            order_amount: orderAmount,
            order_currency: "INR",
            order_id: generateOrderId(),
            customer_details: {
                customer_id: customer_id,
                customer_name: customer_name,
                customer_email: customer_email,
                customer_phone: "9999999999"
            },
        };

        Cashfree.PGCreateOrder("2023-08-01", request)
            .then((response) => {
                console.log(response.data);
                res.json(response.data);
            })
            .catch((error) => {
                console.error(error.response.data.message);
            });
    } catch (error) {
        console.log(error);
    }
});

app.post("/api/verify", async (req, res) => {
    console.log(req.body);
    try {
        let { orderId } = req.body;
        console.log(orderId, 'verify mei')

        Cashfree.PGOrderFetchPayments("2023-08-01", orderId)
            .then((response) => {
                res.json(response.data);
            })
            .catch((error) => {
                console.error(error.response.data.message);
            });
    } catch (error) {
        console.log(error);
    }
});



app.post("/api/send-welcome-email", (req, res) => {
    const { email, userName } = req.body;

    const mailOptions = {
        from: '"Capsai" <ai.editor@capsai.co>',
        to: email,
        subject: 'Welcome to Capsai',
        html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to CapsAI</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
              }
              .email-container {
                  max-width: 600px;
                  margin: auto;
                  background-color: #ffffff;
                  padding: 0;
                  border-radius: 10px;
                  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                  overflow: hidden;
              }
              .header {
                  background-color: #0073e6;
                  text-align: center;
                  padding: 20px;
              }
              .header img {
                  width: 150px;
              }
              .banner {
                  width: 100%;
                  height: auto;
              }
              .content {
                  padding: 20px;
                  text-align: left;
                  line-height: 1.6;
              }
              .content h1 {
                  color: #333333;
              }
              .content p {
                  color: #666666;
              }
              .features {
                  display: flex;
                  justify-content: space-between;
                  padding: 20px 0;
              }
              .feature {
                  width: 30%;
                  text-align: center;
              }
              .feature img {
                  width: 100%;
                  border-radius: 10px;
              }
              .footer {
                  text-align: center;
                  padding: 10px;
                  font-size: 12px;
                  color: #999999;
              }
              .footer a {
                  color: #1e90ff;
                  text-decoration: none;
              }
          </style>
      </head>
      <body>
          <div class="email-container">
             
                   <img src="https://capsaistore.blob.core.windows.net/capsaiassets/Welcome_banner.png" alt="Welcome Banner" class="banner">
            
            <div class="content">
                
                <p>Hi ${userName},</p>
                <p>We’re thrilled to welcome you to the CapsAI community!</p>
                <p>CapsAI is designed to make your life easier by automating the subtitle generation process and providing access to a wide range of premium fonts. Whether you're a seasoned creator or just starting out, CapsAI has the tools you need to elevate your content.</p>
                <p>What You Can Do with CapsAI:</p>
                <ul>
                    <li>😊 <strong>Generate subtitles automatically:</strong> Streamline your workflow.</li>
                    <li>🛠️ <strong>Customize with premium fonts:</strong> Make your videos stand out.</li>
                    <li>✨ <strong>Access intuitive tools:</strong> Designed for creators of all levels.</li>
                </ul>
                <p>Ready to unlock all the features? <a href="https://capsai.co/pricing" target="_blank" style="color: #1e90ff; text-decoration: none;">Subscribe now</a> and experience everything CapsAI has to offer.</p>
                <p>If you ever have questions or need assistance, please don't hesitate to reach out. Enjoy your CapsAI experience!</p>
                <p>Warm regards,<br>Team CapsAI</p>
            </div>
            <div class="footer">
                <p>&copy; 2024 CapsAI. All rights reserved.</p>
                <p><a href="https://capsai.co/">Unsubscribe</a></p>
            </div>
          </div>
      </body>
      </html>
    `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.status(200).send('Email sent successfully');
        }
    });
});


app.post("/api/creds-refuel", (req, res) => {
    const { email, userName } = req.body;

    const mailOptions = {
        from: '"Capsai" <ai.editor@capsai.co>',
        to: email,
        subject: 'Refuel Your Minutes-Plans Starting at ₹29',
        html: `
    <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CapsAI Pricing Plans</title>
<link rel="stylesheet" href="styles.css">
<style>
body, html {
    margin: 0;
    padding: 16;
    font-family: Arial, sans-serif;
    background: #ffffff;
    color: #333;
}

.email-container {
    width: 100%;
    max-width: 600px;
    margin: auto;
    background: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    
}
header {
    background-image: url('https://res.cloudinary.com/dykfhce2b/image/upload/v1726401709/Line_jplj8n.png');
    padding: 40px;
   
    text-align: center;
    color: black;
}

header h1 {
    margin-inline:50px;
}
header p {
 
  margin-block: 30px;
}

.social-preview img {
    width: 100%;
}

.content {
    padding: 20px;
    line-height: 1.6;
}

.pricing ul, .details ul {
    list-style: none;
    padding: 0;
}

.pricing li, .details li {
    background: #f4f4f9;
    margin: 10px 0;
    padding: 10px;
    border-radius: 4px;
}

.btn-explore {
    background: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    
    cursor: pointer;
    border-radius: 5px;
    text-decoration: none;
}

button:hover {
    background: #0056b3;
}

footer {
    padding: 20px;
    text-align: left;
    font-size: 0.85em;
}

.social-icons img {
    width: 24px;
    margin: 0 5px;
}

.footer-links a {
    color: #007bff;
    text-decoration: none;
    margin-right: 10px;
}

 </style>
</head>
<body>
<div class="email-container">
    <a href="https://capsai.co/pricing" target="_blank"><img src="https://capsaistore.blob.core.windows.net/capsaiassets/refuel.png" alt="Welcome Banner" class="banner"></a>
    <section class="content">
         <div class="email-content">
            <p>Hi ${userName},</p>
            <p>🎉 Tailored Pricing Plans Just for You! 🎉</p>
            <p>Whether you're just starting out or you're a seasoned content creator, we have a plan that's perfect for you.</p>
            <p>Here's what you can expect:</p>
            <ul>
                <li>Affordable Plans: Starting at just Rs 29</li>
                <li>Flexible Validity: Subtitle your content at your own pace</li>
                <li>Tailored Minutes: Plans that match your content needs</li>
            </ul>
            <p>Check out the details below and find the plan that’s right for you:</p>
            <ul class="pricing-list">
                <li>Rs 29 Plan: 20 minutes, 20 days validity</li>
                <li>Rs 99 Plan: 70 minutes, 30 days validity</li>
                <li>Rs 199 Plan: 150 minutes, 45 days validity</li>
            </ul>
            <p>✨ Don’t miss out on making your content shine with perfect subtitles! Start Subtitling Today!</p>
            <a href="https://capsai.co/pricing" class="btn-explore">Explore now</a>
        </div>
    </section>
    <footer>
        <p>Cheers,</p>
        <p>The Capsai Team</p>
        <!--<div class="social-icons">-->
        <!--    <img src="icon-x.png" alt="Social X">-->
        <!--    <img src="icon-linkedin.png" alt="LinkedIn">-->
        <!--    <img src="icon-instagram.png" alt="Instagram">-->
        <!--</div>-->
        <!--<div class="footer-links">-->
        <!--    <a href="#">Unsubscribe</a>-->
        <!--    <a href="#">Terms Privacy</a>-->
        <!--    <a href="#">About us</a>-->
        <!--</div>-->
    </footer>
</div>
</body>
</html>
    `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.status(200).send('Email sent successfully');
        }
    });
});



app.post("/api/sendVerificationCode-email-auth", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    const verificationCode = Math.floor(1000 + Math.random() * 9000);

    try {
        // Save the code to Firestore
        await db.collection("verificationCodes").doc(email).set({
            code: verificationCode,
            expiresAt: Date.now() + 1 * 60 * 1000,
        });


        const mailOptions = {
            from: '"Capsai" <ai.editor@capsai.co>',
            to: email,
            subject: "Your Verification Code",
            html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="initial-scale=1, width=device-width">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gilroy:wght@400;600;700;800&display=swap" />
            <style>
              .frame-child {
                width: 47px;
                position: relative;
                height: 45.4px;
              }
              .verify-your-email {
                font-weight: 600;
              }
              .capsai {
                font-weight: 800;
              }
              .verify-your-email-container {
                align-self: stretch;
                position: relative;
              }
              .to-complete-the {
                width: 372px;
                position: relative;
                font-size: 16px;
                color: rgba(0, 0, 0, 0.5);
                display: inline-block;
              }
              .verify-your-email-to-sign-up-f-parent {
                align-self: stretch;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                gap: 10px;
              }
              .b {
                width: 85px;
                position: relative;
                letter-spacing: 0.1em;
                display: inline-block;
                height: 24px;
                flex-shrink: 0;
              }
              .wrapper {
                align-self: stretch;
                border-radius: 14px;
                background-color: #f6f6f6;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
                padding: 20px 200px;
                text-align: left;
                font-size: 24px;
              }
              .frame-parent {
                align-self: stretch;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                gap: 42px;
              }
              .group-parent {
                width: 100%;
                position: relative;
                border-radius: 14px;
                background-color: #fff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                padding: 32px;
                box-sizing: border-box;
                gap: 31px;
                text-align: center;
                font-size: 20px;
                color: #000;
                font-family: Gilroy;
              }
            </style>
          </head>
          <body>
            <div class="group-parent">
              <img class="frame-child" alt="" src="Group 1686554423.svg">
              <div class="frame-parent">
                <div class="verify-your-email-to-sign-up-f-parent">
                  <div class="verify-your-email-container">
                    <span class="verify-your-email">Verify your email to sign up for </span>
                    <span class="capsai">CapsAI</span>
                  </div>
                  <div class="to-complete-the">
                    To complete the sign-up process, enter this 6-digit code in the original window:
                  </div>
                </div>
                <div class="wrapper">
                  <b class="b">${verificationCode}</b>
                </div>
              </div>
            </div>
          </body>
          </html>
          `,
        };




        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                res.status(500).send('Error sending email');
            } else {
                console.log('Email sent: ' + info.response);
                res.status(200).send('Email sent successfully');
            }
        });

        res.status(200).json({ message: "Verification code sent" });
    } catch (error) {
        console.error("Error sending verification code:", error);
        res.status(500).json({ message: "Failed to send email", error: error.message });
    }
});


app.post("/api/verifyCode-email-auth", async (req, res) => {
    const { email, code, uid } = req.body;
    console.log(email, code, uid);

    if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required." });
    }

    const doc = await db.collection("verificationCodes").doc(email).get();
    if (!doc.exists || doc.data().code !== code || Date.now() > doc.data().expiresAt) {
        return res.status(400).json({ message: "Invalid or expired code." });
    }


    await db.collection("verificationCodes").doc(email).delete();


    const auth = getAuth();
    const customToken = await auth.createCustomToken(email);

    res.status(200).json({ token: customToken });
});



function generateSRT(words) {
    let srt = '';
    words.forEach((el, index) => {
        srt += `${index + 1}\n`;
        srt += `${el.timeStart} --> ${el.timeEnd}\n`;
        srt += `${el.value}\n\n`;
    });
    return srt;
}


function formatSubtitle(text) {
    const entries = text.trim().split('\n\n');
    const result = [];

    entries.forEach(entry => {
        const lines = entry.split('\n');
        const idLine = lines[0].trim();
        const timeLine = lines[1].trim();
        const valueLine = lines.slice(2).join(' ').trim();

        const idValue = parseInt(idLine);
        const [timeStart, timeEnd] = timeLine.match(/\d{2}:\d{2}:\d{2},\d{3}/g);

        const totalDuration = parseTimecode(timeEnd) - parseTimecode(timeStart);

        // Treat the entire valueLine as a single unit
        const wordTimeStart = parseTimecode(timeStart);
        const wordTimeEnd = parseTimecode(timeEnd);

        const formattedEntry = {
            id: `${idValue}-1`,
            timeStart: formatTimecode(wordTimeStart),
            timeEnd: formatTimecode(wordTimeEnd),
            value: valueLine,
        };
        result.push(formattedEntry);
    });

    return result;
}

function parseTimecode(timecode) {
    const [hours, minutes, seconds] = timecode.split(':');
    const [secs, millis] = seconds.split(',');
    return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs)) * 1000 + parseInt(millis);
}

function formatTimecode(milliseconds) {
    const hours = Math.floor(milliseconds / 3600000).toString().padStart(2, '0');
    const minutes = Math.floor((milliseconds % 3600000) / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((milliseconds % 60000) / 1000).toString().padStart(2, '0');
    const millis = (milliseconds % 1000).toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${millis}`;
}

async function transcribeVideo(videoPath, isoneWord) {
    try {
        const transcriptionRequest = {
            file: fs.createReadStream(videoPath),
            model: "whisper-1",
            response_format: "verbose_json",
        };

        // Conditionally add the timestamp_granularities field
        if (isoneWord) {
            transcriptionRequest.timestamp_granularities = ["word"];
        }

        const transcription = await openai.audio.transcriptions.create(transcriptionRequest);
        return transcription;
    } catch (error) {
        console.error('Error transcribing video:', error);
        throw error;
    }
}

async function convertHindiToHinglish(changetext, language) {
    let prompt;
    if (language == 'Hindi') {
        prompt = `Convert the following text to hindi in pure devnagri alphabets  in SRT format.Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`
    }
    else if (language == 'English') {
        prompt = `Convert the following text to english in SRT format.Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`
    } else {
        prompt = `Convert the following Hindi text to Hinglish in SRT format. Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`
    }
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt },
            ],
            model: "gpt-4o-mini-2024-07-18",
        });

        const hinglishText = completion.choices[0].message.content;
        return hinglishText;
    } catch (error) {
        console.error("Error translating text:", error);
    }
}


const convertColorToAss = (color) => {
    if (!color) return '&H00FFFFFF'; // Default to white if color is undefined

    if (typeof color === 'string') {
        if (color.startsWith('#')) {
            const rgb = color.replace('#', '').match(/.{2}/g);
            if (rgb && rgb.length === 3) {
                return `&H00${rgb[2]}${rgb[1]}${rgb[0]}`;
            }
        } else if (color.startsWith('rgba')) {
            const matches = color.match(/\d+(\.\d+)?/g);
            if (matches && matches.length === 4) {
                const [r, g, b, a] = matches.map(Number);
                const alpha = Math.round(a * 255);
                return `&H${alpha.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`;
            }
        }
    }

    console.warn(`Invalid color format: ${color}. Defaulting to white.`);
    return '&H00FFFFFF'; // Default to white if color format is not recognized
};


// Parse complex text shadow
const parseTextShadow = (textShadow) => {
    if (!textShadow) return { maxBlur: 0, maxOffset: 0, shadowColor: '' };

    const shadows = textShadow.split(/,(?![^(]*\))/g).map(shadow => shadow.trim());
    let maxBlur = 0;
    let maxOffset = 0;
    let shadowColor = '';

    shadows.forEach(shadow => {
        const rgbaMatch = shadow.match(/rgba?\([^)]+\)/);
        let parts;
        let color = '';

        if (rgbaMatch) {
            color = rgbaMatch[0];
            parts = shadow.replace(color, '').trim().split(/\s+/);
        } else {
            parts = shadow.split(/\s+/);
        }

        if (parts.length >= 3) {
            const [offsetX, offsetY, blur] = parts;
            if (!color && parts.length > 3) {
                color = parts.slice(3).join(' ');
            }

            console.log(color, "Shadow colour");
            const blurValue = parseFloat(blur);
            maxBlur = Math.max(maxBlur, isNaN(blurValue) ? 0 : blurValue);
            maxOffset = Math.max(maxOffset, Math.abs(parseFloat(offsetX) || 0), Math.abs(parseFloat(offsetY) || 0));
            if (!shadowColor && color) {
                shadowColor = color;
            }
        }
    });

    return { maxBlur, maxOffset, shadowColor };
};

const convertSrtToAssWordByWord = (srtContent, font, color, yPosition, wordLimit = 1) => {
    const assColor = convertColorToAss(color);
    const fontSize = parseInt(font.fontSize) || 24;
    const fontWeight = (font.fontWeight === 'bold' || parseInt(font.fontWeight) >= 700) ? -1 : 0;
    const fontItalic = font.fontStyle === 'italic' ? 1 : 0;

    // Handle text shadow
    const { maxBlur, maxOffset, shadowColor } = parseTextShadow(font.textShadow);
    const outline = Math.ceil(maxBlur / 10);
    const shadow = Math.ceil(maxOffset / 2);
    const assShadowColor = convertColorToAss(shadowColor);

    // Handle text stroke
    const strokeWidth = parseInt(font.webkitTextStrokeWidth) || 0;
    const strokeColor = convertColorToAss(font.webkitTextStrokeColor);

    // Approximate padding as MarginV (vertical margin)
    const padding = font.padding ? parseInt(font.padding.split(' ')[0]) : 0;
    const marginV = yPosition || 10; // Default margin if no padding specified

    const assHeader = `[Script Info]
Title: Custom Subtitles
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font.fontFamily || 'Arial'},${fontSize},${assColor},&H00000000,&H00000000,${assShadowColor},${fontWeight},${fontItalic},0,0,100,100,${parseFloat(font.letterSpacing) || 0},0.00,1,${outline + strokeWidth},${shadow},2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const srtToAssTime = (time) => {
        return time.replace(",", ".");
    };

    const timeToSeconds = (time) => {
        const [hours, minutes, seconds] = time.split(':');
        const [secs, millis] = seconds.split('.');
        return parseFloat(hours) * 3600 + parseFloat(minutes) * 60 + parseFloat(secs) + parseFloat(millis) / 1000;
    };

    const adjustTime = (startTime, endTime, index, totalChunks) => {
        const startSeconds = timeToSeconds(startTime);
        const endSeconds = timeToSeconds(endTime);
        const duration = endSeconds - startSeconds;
        const chunkDuration = duration / totalChunks;
        const wordStartTime = startSeconds + (index * chunkDuration);
        const wordEndTime = Math.min(wordStartTime + chunkDuration, endSeconds);
        return [
            timestampToAssFormat(wordStartTime),
            timestampToAssFormat(wordEndTime)
        ];
    };

    const timestampToAssFormat = (seconds) => {
        const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toFixed(2).padStart(5, '0');
        return `${hours}:${minutes}:${secs}`;
    };


    const assEvents = srtContent.split(/\n\n/).map((subtitle) => {
        const lines = subtitle.split('\n');
        if (lines.length < 3) return '';
        const [index, time, ...textLines] = lines;
        const [startTime, endTime] = time.split(' --> ').map(srtToAssTime);
        const words = textLines.join(' ').split(/\s+/);
        const totalWords = words.length;


        const groupedEvents = [];
        if (wordLimit > 1) {

            for (let i = 0; i < totalWords; i += wordLimit) {
                const chunk = words.slice(i, Math.min(i + wordLimit, totalWords)).join(' ');
                const chunkIndex = Math.floor(i / wordLimit);
                const totalChunks = Math.ceil(totalWords / wordLimit);
                const [chunkStartTime, chunkEndTime] = adjustTime(startTime, endTime, chunkIndex, totalChunks);
                groupedEvents.push(`Dialogue: 0,${chunkStartTime},${chunkEndTime},Default,,0,0,0,,{\\blur${maxBlur / 2}}${chunk}`);
            }
        } else {

            words.forEach((word, i) => {
                const [wordStartTime, wordEndTime] = adjustTime(startTime, endTime, i, totalWords);
                groupedEvents.push(`Dialogue: 0,${wordStartTime},${wordEndTime},Default,,0,0,0,,{\\blur${maxBlur / 2}}${word}`);
            });
        }

        return groupedEvents.join('\n');
    }).join('\n');

    return assHeader + assEvents;
};



function processTranscriptionToSRT(segments, wordLimit) {
    let srt = '';
    let index = 1;

    segments.forEach((segment) => {
        const words = segment.text.split(' ');
        const totalWords = words.length;
        const segmentDuration = segment.end - segment.start;

        for (let i = 0; i < totalWords; i += wordLimit) {
            const chunk = words.slice(i, i + wordLimit).join(' ');


            const wordStartTime = segment.start + (i / totalWords) * segmentDuration;
            const wordEndTime = segment.start + ((i + wordLimit) / totalWords) * segmentDuration;


            const startTime = secondsToSRTTime(wordStartTime);
            const endTime = secondsToSRTTime(Math.min(wordEndTime, segment.end));


            srt += `${index}\n${startTime} --> ${endTime}\n${chunk}\n\n`;
            index++;
        }
    });

    return srt;
}

function secondsToSRTTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12); // Get "HH:MM:SS.mmm"
    return time.replace('.', ','); // Replace dot with comma for SRT format
}


const adjustTime = (startTime, duration, index, totalWords) => {
    const startTimeSeconds = timeToSeconds(startTime);
    const wordDuration = duration / totalWords;
    const newStartTime = startTimeSeconds + (wordDuration * index);
    const newEndTime = newStartTime + wordDuration;
    return [secondsToTime(newStartTime), secondsToTime(newEndTime)];
};

// Convert SRT time format to seconds
const timeToSeconds = (time) => {
    const [hours, minutes, seconds] = time.split(':').map(parseFloat);
    return hours * 3600 + minutes * 60 + seconds;
};

// Convert seconds back to ASS time format
const secondsToTime = (seconds) => {
    const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${hours}:${minutes}:${secs}`;
};

function generateSRTSimple(words) {
    let srt = '';
    words.forEach((el, index) => {
        const startTime = timestampToSRTFormat(el.start);
        const endTime = timestampToSRTFormat(el.end);

        srt += `${index + 1}\n`;
        srt += `${startTime} --> ${endTime}\n`;
        srt += `${el.word}\n\n`;
    });
    return srt;
}



function timestampToSRTFormat(timestamp) {
    const date = new Date(timestamp * 1000);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5);
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

async function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration / 60; // in minutes
                resolve(duration);
            }
        });
    });
}


const scheduleFileDeletion = (containerName, blobName, delayInMinutes) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + delayInMinutes);

    const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    cron.schedule(cronExpression, async () => {
        try {
            await deleteFromAzure(containerName, blobName);
            console.log(`File ${blobName} deleted from container ${containerName}`);
        } catch (error) {
            console.error(`Error deleting file ${blobName} from container ${containerName}:`, error);
        }
    });
};

const scheduleDocumentDeletion = (collectionPath, docId, delayInMinutes) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + delayInMinutes);

    // Schedule cron job based on future date
    const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    cron.schedule(cronExpression, async () => {
        try {
            // Reference to the specific document
            const docRef = admin.firestore().doc(`${collectionPath}/${docId}`);

            // Delete the document
            await docRef.delete();
            console.log(`Document with ID: ${docId} deleted from ${collectionPath}`);
        } catch (error) {
            console.error(`Error deleting document with ID: ${docId} from ${collectionPath}:`, error);
        }
    });

    console.log(`Scheduled document deletion for ${docId} at ${date}`);
};


const VideoEmojiprocessing = async (assFilePath, videoPath, watermarkPath) => {
    console.log("emoji processing started");

    try {
        const { subtitles } = parseASS(assFilePath, emojiMapping, assFilePath);
        const outputFilePath = path.join(__dirname, 'uploads', `emojitempoutput_${Date.now()}.mp4`);

        // Optimize emoji processing by batching
        const emojiMap = new Map(); // Store unique emojis
        const overlayCommands = [];
        let overlayIndex = 0;

        // Pre-process subtitles to identify unique emojis and generate overlay commands
        subtitles.forEach((subtitle) => {
            subtitle.emojis.forEach((emoji) => {
                const emojiPng = path.join(__dirname, emojiMapping[emoji]);
                if (!emojiMap.has(emojiPng)) {
                    emojiMap.set(emojiPng, overlayIndex + 1);
                }

                const startTime = timeToSeconds(subtitle.start);
                const endTime = timeToSeconds(subtitle.end);
                const emojiSize = 45;
                const emojiX = `${subtitle.x}-${emojiSize / 2}`;
                const emojiY = `${subtitle.y}-${emojiSize}`;

                overlayCommands.push({
                    inputIndex: emojiMap.get(emojiPng),
                    command: `[${emojiMap.get(emojiPng)}:v]scale=${emojiSize}:${emojiSize}[emoji${overlayIndex}];
                    [tmp${overlayIndex}][emoji${overlayIndex}]overlay=x='${emojiX}':y='${emojiY}':enable='between(t,${startTime},${endTime})'[tmp${overlayIndex + 1}];`
                });
                overlayIndex++;
            });
        });

        // Build optimized FFmpeg command
        const emojiInputs = Array.from(emojiMap.keys()).map(path => `-i "${path}"`).join(' ');

        // Create filter complex command with optimized chain
        let filterComplex = `[0:v]scale=720:1280[tmp0];`;
        overlayCommands.forEach((overlay, index) => {
            filterComplex += overlay.command.replace('[scaled]', `[tmp${index}]`);
        });

        // Add final subtitle overlay
        filterComplex += `[tmp${overlayCommands.length}]subtitles=${assFilePath}:force_style='FontSize=18'[final]`;

        const ffmpegCommand = `ffmpeg -i "${videoPath}" ${emojiInputs} -filter_complex "${filterComplex}" -map "[final]" -map 0:a -c:a copy -preset veryfast -y "${outputFilePath}"`;

        // Add timeout and progress monitoring
        const maxExecutionTime = 300000; // 5 minutes timeout
        const ffmpegProcess = exec(ffmpegCommand, { maxBuffer: 1024 * 1024 * 10 }); // Increase buffer size

        let lastProgress = Date.now();
        ffmpegProcess.stderr.on('data', (data) => {
            lastProgress = Date.now();
            console.log(`FFmpeg progress: ${data}`);
        });

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                ffmpegProcess.kill();
                reject(new Error('FFmpeg processing timed out'));
            }, maxExecutionTime);

            ffmpegProcess.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });

            ffmpegProcess.on('exit', (code) => {
                clearTimeout(timeoutId);
                if (code === 0) {
                    console.log('FFmpeg processing completed successfully');
                    resolve(outputFilePath);
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });
        });
    } catch (error) {
        console.error('Error in VideoEmojiprocessing:', error);
        throw error;
    }
};


function generateOrderId() {
    const uniqueId = crypto.randomBytes(16).toString("hex");

    const hash = crypto.createHash("sha256");
    hash.update(uniqueId);

    const orderId = hash.digest("hex");
    7;

    return orderId.substr(0, 12);
}

function parseStyles(lines) {
    const styleSection = lines.findIndex((line) => line.trim() === '[V4+ Styles]');
    if (styleSection === -1) return null;

    const formatLine = lines[styleSection + 1];
    const styleLine = lines[styleSection + 2];

    if (!formatLine || !styleLine) return null;

    const formatFields = formatLine.split(':')[1].split(',').map(f => f.trim());
    const styleFields = styleLine.split(':')[1].split(',').map(f => f.trim());

    const style = {};
    formatFields.forEach((field, index) => {
        style[field] = styleFields[index];
    });

    return style;
}


function parseASS(file, emojiMapping, outputPath) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const subtitles = [];
    const modifiedLines = [...lines];

    // Parse style information
    const style = parseStyles(lines); // Ensure `parseStyles` is defined
    const videoHeight = 1280; // Assuming 720p video
    const videoWidth = 780;

    const marginV = parseFloat(style?.MarginV || 101.25);
    const alignment = parseInt(style?.Alignment || 2);

    const defaultY = videoHeight - marginV;

    // Find the `[Events]` section
    const eventsStart = lines.findIndex((line) => line.trim() === '[Events]');
    if (eventsStart === -1) return { subtitles, modifiedLines };

    const formatLine = lines[eventsStart + 1];
    const formatFields = formatLine.split(':')[1].split(',').map((field) => field.trim());
    const textIndex = formatFields.indexOf('Text');
    if (textIndex === -1) return { subtitles, modifiedLines };

    const events = lines.slice(eventsStart + 2).filter((line) => line.startsWith('Dialogue:'));

    events.forEach((line, lineIndex) => {
        const parts = line.split(',');
        const start = parts[1].trim();
        const end = parts[2].trim();
        const text = parts.slice(textIndex).join(',').trim();

        const emojis = [...text].filter((char) => emojiMapping[char]);

        if (emojis.length > 0) {
            const emojiRegex =
                /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{1F000}-\u{1F02B}]/gu;
            const textWithoutEmoji = text.replace(emojiRegex, '').trim();

            const x = videoWidth / 2;
            const y = defaultY;

            subtitles.push({
                start,
                end,
                text: textWithoutEmoji,
                emojis,
                x,
                y,
            });

            // Modify the line in the ASS file
            const modifiedLine = parts.slice(0, textIndex).join(',') + ',' + textWithoutEmoji;
            modifiedLines[eventsStart + 2 + lineIndex] = modifiedLine;
        }
    });

    // Write the modified ASS file to the output path
    fs.writeFileSync(outputPath, modifiedLines.join('\n'), 'utf-8');

    return { subtitles, modifiedLines };
}


app.listen(3000, () => console.log('Server running on port 3000'));




// const express = require("express");
// const cors = require("cors");
// const crypto = require("crypto");
// const { Cashfree } = require("cashfree-pg");

// require("dotenv").config();

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(
//   express.urlencoded({
//     extended: true,
//   })
// );



// app.listen(8000, () => {
//   console.log("Server is running on port 8000");
// });
