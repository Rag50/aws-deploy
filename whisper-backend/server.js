const express = require('express')
const multer = require('multer')
const fs = require('fs')
const { exec, execSync } = require('child_process')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
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
const DodoPayments = require('dodopayments');
const https = require('https');
dotenv.config();

// live setup 
const PRODUCT_MAPPING = {
    1.99: 'pdt_uwqatZU7K1BaqsNeYlOWc',
    3.99: 'pdt_J3WoHFbvVLoONYIIWteT5',
    5.99: 'pdt_VCCzkntjz5GOZBx8DQZuo',
    7.99: 'pdt_UK6liWZ39h9QEaPeAu9vE',
    9.99: 'pdt_fIVAjFQwoDzqYmaE4zHop',
    11.99: 'pdt_zZosDjr2HYH6bw69b9Unt',
    14.99: 'pdt_reRUcid3GTNyrR0guxszQ',
    17.99: 'pdt_RBxDwHIY7AerKbk55qVUM',
    20.00: 'pdt_FH53QV66vuRKYdLX99yjF'
};

// Fallback product ID if no matching amount is found
const DEFAULT_USD_PRODUCT_ID = process.env.DODO_DEFAULT_PRODUCT || 'pdt_uwqatZU7K1BaqsNeYlOWc';

/**
 * Get the appropriate product ID based on the amount
 * @param {number} amount - The amount in USD (e.g., 1.77 for $1.77)
 * @returns {string} The product ID to use
 */
function getProductIdForAmount(amount) {
    // Convert amount to cents for comparison
    const amountInCents = Math.round(amount * 100);

    // Check if we have a direct match
    if (PRODUCT_MAPPING[amountInCents]) {
        return PRODUCT_MAPPING[amountInCents];
    }

    // If no direct match, find the closest lower amount
    const availableAmounts = Object.keys(PRODUCT_MAPPING).map(Number).sort((a, b) => b - a);
    const matchingAmount = availableAmounts.find(a => a <= amountInCents);

    return matchingAmount ? PRODUCT_MAPPING[matchingAmount] : DEFAULT_USD_PRODUCT_ID;
}

// Enhanced HTTP agent configuration
const httpsAgent = new https.Agent({
    keepAlive: true,
    timeout: 30000,
    rejectUnauthorized: true,
    keepAliveMsecs: 10000,
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: 30000
});

// Initialize Dodo client with enhanced configuration
const dodoClient = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY,
    environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
    httpAgent: httpsAgent,
    maxRetries: 3,
    timeout: 30000,
    // Override the fetch implementation to add better logging
    fetch: async (url, options) => {
        console.log('Dodo API Request:', {
            url,
            method: options.method,
            headers: options.headers,
            body: options.body ? JSON.parse(options.body) : undefined
        });

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));

            console.log('Dodo API Response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                data
            });

            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                json: async () => data,
                text: async () => JSON.stringify(data)
            };
        } catch (error) {
            console.error('Dodo API Request Failed:', error);
            throw error;
        }
    }
});

// Test Dodo API connectivity
async function testDodoConnection() {
    try {
        console.log('Testing connection to Dodo Payments API...');
        const response = await axios.get('https://test.dodopayments.com/health', {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000
        });
        console.log('Dodo API health check:', response.status, response.statusText);
        return true;
    } catch (error) {
        console.error('Dodo API connection test failed:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        return false;
    }
}

// Test connection on startup
testDodoConnection().then(isConnected => {
    console.log('Dodo API connection test result:', isConnected ? 'SUCCESS' : 'FAILED');
});

var serviceAccount = require("./caps-85254-c5d3e9cf206a.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const cron = require('node-cron');

const db = getFirestore();


const app = express();
app.use(cors());
app.use(express.json());



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


Cashfree.XClientId = process.env.CASHFREE_APPID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRETKEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;



const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORE);
const containerClient = blobServiceClient.getContainerClient('capsuservideos');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create uploads directory if it doesn't exist
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// File filter to check file type and size
const fileFilter = (req, file, cb) => {
    // Check file type
    const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm'];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only video files are allowed.'), false);
    }
    
    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size && file.size > maxSize) {
        return cb(new Error('File size exceeds 50MB limit.'), false);
    }
    
    cb(null, true);
};

// Configure multer with limits and file filter
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1 // Only allow 1 file per request
    },
    fileFilter: fileFilter
});

// Error handling middleware for multer errors
const handleMulterError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File size exceeds 50MB limit. Please upload a smaller video file.' 
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ 
                error: 'Too many files. Please upload only one video file.' 
            });
        }
        return res.status(400).json({ 
            error: 'File upload error: ' + error.message 
        });
    }
    
    if (error.message && error.message.includes('Invalid file type')) {
        return res.status(400).json({ 
            error: 'Invalid file type. Only video files (MP4, AVI, MOV, WMV, FLV, WEBM) are allowed.' 
        });
    }
    
    if (error.message && error.message.includes('File size exceeds')) {
        return res.status(400).json({ 
            error: 'File size exceeds 50MB limit. Please upload a smaller video file.' 
        });
    }
    
    next(error);
};

async function uploadToAzure(filePath, customFilename = null) {
    try {


        const blobName = customFilename || path.basename(filePath);

        console.log(`Uploading file: ${filePath} as: ${blobName}`);

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);


        const fileStream = fs.createReadStream(filePath);
        const uploadBlobResponse = await blockBlobClient.uploadStream(fileStream);

        console.log(`Upload completed. Blob name: ${blobName}`);

        return {
            url: blockBlobClient.url,
            blobName: blobName,
            uploadResponse: uploadBlobResponse
        };
    } catch (error) {
        console.error('Error uploading to Azure:', error);
        throw error;
    }
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


const AZURE_OPENAI_API_KEY = ''
const AZURE_OPENAI_API_KEY_INTERNATIONAL = ''

app.post('/api/process-video', upload.single('video'), handleMulterError, async (req, res) => {
    let videoFilePath = null;
    let srtFilePath = null;
    let outputPath = null;
    
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }
        
        videoFilePath = req.file.path;
        console.log(videoFilePath);
        const language = req.body.SelectedLang;
        const isoneWord = req.body.WordLimit === 'true';
        const wordLayout = req.body.WordLayout;

        const originalFilename = req.file.originalname;

        console.log(isoneWord, "from front");
        let remaningmins = 0;
        outputPath = `${videoFilePath}_random.mp4`;
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');

        const transcription = await processVideoInput(videoFilePath, isoneWord);
        console.log(transcription.segments, "process wali")

        let srtContent

        console.log("Ran");
        if (isoneWord) {
            srtContent = generateSRTFromWords(transcription.words);
        } else {
            srtContent = generateSRTNormal(transcription.segments, 4);
        }


        let outputSrt;

        const directLanguages = ["English", "Hindi"];
        const supportedLanguages = ["Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Punjabi"];

        if (transcription.language.toLowerCase() === language.toLowerCase()) {
            // If the transcription is already in the selected language, use as is
            outputSrt = srtContent;
        } else {
            // Otherwise, always call GPT-4 for translation
            console.log('Called');
            outputSrt = await callGPT4(language, srtContent);
        }


        const originalNameWithoutExt = originalFilename.replace(/\.[^/.]+$/, "");
        srtFilePath = path.join(__dirname, 'uploads', `${originalNameWithoutExt}.srt`);
        fs.writeFileSync(srtFilePath, outputSrt);

        const random = processShuffledText(wordLayout, videoFilePath, srtFilePath, outputPath, isoneWord);
        console.log(random, "Scripttttt")


        let videoUpload;
        if (wordLayout == 'Shuffled text') {
            const processedFilename = `processed_${originalFilename}`;
            videoUpload = await uploadToAzure(outputPath, processedFilename);
        } else {
            videoUpload = await uploadToAzure(videoFilePath, originalFilename);
        }


        const srtUpload = await uploadToAzure(srtFilePath, `${originalNameWithoutExt}.srt`);
        console.log(videoUpload, srtUpload)


        // Cleanup temporary files
        try {
            if (srtFilePath && fs.existsSync(srtFilePath)) {
                fs.unlinkSync(srtFilePath);
            }
            if (wordLayout == 'Shuffled text' && outputPath && fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            // Clean up original uploaded file
            if (videoFilePath && fs.existsSync(videoFilePath)) {
                fs.unlinkSync(videoFilePath);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }

        res.json({
            transcription: formatSubtitle(outputSrt),
            rawData: transcription.words,
            inputFile: videoUpload.url,
            lang: transcription.language,
            key: videoUpload.blobName,
            srt: srtUpload.url,
            originalFilename: originalFilename,
        });
    } catch (error) {
        // Cleanup on error
        try {
            if (videoFilePath && fs.existsSync(videoFilePath)) {
                fs.unlinkSync(videoFilePath);
            }
            if (srtFilePath && fs.existsSync(srtFilePath)) {
                fs.unlinkSync(srtFilePath);
            }
            if (outputPath && fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch (cleanupError) {
            console.error('Error during error cleanup:', cleanupError);
        }
        
        console.error('Error processing video:', error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/change-style', upload.single('video'), handleMulterError, async (req, res) => {
    let srtFilePath = null;
    let assFilePath = null;
    let outputFilePath = null;
    let modifedInput = null;
    
    try {

        if (req.body.deletion) {
            // Verify scheduler identity
            if (req.get('X-CloudScheduler') !== 'true') {
                console.error('Unauthorized deletion attempt');
                return res.status(403).json({ error: 'Unauthorized' });
            }

            // Verify HMAC signature
            const receivedSignature = req.get('X-Signature');
            const expectedSignature = crypto
                .createHmac('sha256', process.env.SCHEDULER_SECRET)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (receivedSignature !== expectedSignature) {
                console.error('Invalid signature:', { receivedSignature, expectedSignature });
                return res.status(403).json({ error: 'Invalid signature' });
            }

            // Process deletions
            if (req.body.deleteType === 'azure-blob') {
                await deleteFromAzure(req.body.containerName, req.body.blobName);
                console.log(`Deleted Azure blob: ${req.body.blobName}`);
            }
            else if (req.body.deleteType === 'firestore-doc') {
                const docRef = admin.firestore().doc(req.body.docPath);
                await docRef.delete();
                console.log(`Deleted Firestore document: ${req.body.docPath}`);
            }

            return res.status(204).end();
        }

        const { inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize, userdata, uid, save, keyS3, transcriptions, isOneword, videoResolution, soundEffects } = req.body;
        if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize || !userdata || !uid) {
            return res.status(400).json({ error: 'Missing required fields in the request body' });
        }
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.png');
        const tempassFile = path.join(__dirname, 'watermarks', 'temp.ass');
        const videoPath = inputVideo;
        srtFilePath = path.join(__dirname, 'uploads', `${path.basename(srtUrl)}`);
        const srtResponse = await axios.get(srtUrl);
        fs.writeFileSync(srtFilePath, srtResponse.data);
        const srtContent = generateSRT(transcriptions);
        let assContent = isOneword ? convertSrtToAssWordByWord(srtContent, font, color, yPosition) : convertSrtToAssWordByWord(srtContent, font, color, yPosition, 4);
        assFilePath = path.join(__dirname, 'uploads', 'subtitles.ass');
        fs.writeFileSync(assFilePath, assContent);
        const tempOutputPath = temp.path({ suffix: '.mp4' });
        let resheight;
        let resWidth;

        if (videoResolution == '16:9') {
            resheight = 1080;
            resWidth = 1920;
        } else if (videoResolution == '1:1') {
            resheight = 1080;
            resWidth = 1080;
        } else {
            resWidth = 720;
            resheight = 1280;
        }


        let remaningmins = 0;

        modifedInput = await VideoEmojiprocessing(assFilePath, videoPath, watermarkPath, resWidth, resheight);
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
        outputFilePath = path.join(__dirname, 'uploads', path.basename(videoPath).replace('.mp4', '_output.mp4'));



        await new Promise((resolve, reject) => {
            if (userdata.usertype === 'free') {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `[${watermarkStreamIndex}:v]scale=120:55[watermark]; ` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=16/9[scaled]; ` +
                        `[scaled][watermark]overlay=1700:120,subtitles='${tempassFile}':force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;

                } else if (videoResolution === '1:1') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `[${watermarkStreamIndex}:v]scale=120:55[watermark]; ` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=1/1[scaled]; ` +
                        `[scaled][watermark]overlay=860:100,subtitles='${tempassFile}':force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;

                } else {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `[${watermarkStreamIndex}:v]scale=120:55[watermark]; ` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v][watermark]overlay=494:120,subtitles='${tempassFile}':force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                }
            } else {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=16/9,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else if (videoResolution === '1:1') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=1/1,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
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

        // save logic  old one 
        if (save) {

            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;


            await db.collection('deletionTasks').add({
                type: 'azure-blob',
                containerName: 'capsuservideos',
                blobName: keyS3,
                deleteAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (userdata.usertype === 'free' ? 15 : 20) * 60000)
                )
            });


            await db.collection('deletionTasks').add({
                type: 'azure-blob',
                containerName: 'capsuservideos',
                blobName: outputUpload.blobName,
                deleteAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (userdata.usertype === 'free' ? 15 : 20) * 60000)
                )
            });

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
            await db.collection('deletionTasks').add({
                type: 'firestore-doc',
                docPath: `users/${uid}/videos/${newDocRef.id}`,
                deleteAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (userdata.usertype === 'free' ? 15 : 20) * 60000))
            });

        } else {

            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;
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

        // Cleanup temporary files
        try {
            if (srtFilePath && fs.existsSync(srtFilePath)) {
                fs.unlinkSync(srtFilePath);
            }
            if (assFilePath && fs.existsSync(assFilePath)) {
                fs.unlinkSync(assFilePath);
            }
            if (outputFilePath && fs.existsSync(outputFilePath)) {
                fs.unlinkSync(outputFilePath);
            }
            if (modifedInput && fs.existsSync(modifedInput)) {
                fs.unlinkSync(modifedInput);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }

        res.json({ videoUrl: outputVideoUrl });
    } catch (error) {
        // Cleanup on error
        try {
            if (srtFilePath && fs.existsSync(srtFilePath)) {
                fs.unlinkSync(srtFilePath);
            }
            if (assFilePath && fs.existsSync(assFilePath)) {
                fs.unlinkSync(assFilePath);
            }
            if (outputFilePath && fs.existsSync(outputFilePath)) {
                fs.unlinkSync(outputFilePath);
            }
            if (modifedInput && fs.existsSync(modifedInput)) {
                fs.unlinkSync(modifedInput);
            }
        } catch (cleanupError) {
            console.error('Error during error cleanup:', cleanupError);
        }
        
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }
});


// one word ai emoji sync addition 
app.post('/api/aiemoji-sync', async (req, res) => {
    try {
        const { transcriptions } = req.body;
        let transcription = await addEmojisToTranscription(transcriptions);

        res.json({ transcriptions: transcription });

    } catch (error) {
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }

})

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


app.post('/api/dodo-payment', async (req, res) => {
    try {
        const {
            billing = {},
            customer = {},
            amount,
            description,
            return_url,
        } = req.body;

        // Validate required fields
        if (!amount || isNaN(amount)) {
            return res.status(400).json({
                error: 'Invalid amount',
                message: 'Amount is required and must be a number',
            });
        }

        if (!customer.email || !customer.name) {
            return res.status(400).json({
                error: 'Missing customer information',
                message: 'Customer email and name are required',
            });
        }

        // Set default billing information if not provided
        const billingInfo = {
            city: billing.city || 'City',
            country: billing.country || 'US',
            state: billing.state || 'State',
            street: billing.street || 'Street',
            zipcode: billing.zipcode || '000000',
        };

        const productId = getProductIdForAmount(amount);

        const successUrl = `${return_url}`;
        const cancelUrl = `${return_url}`;


        // Prepare payment data
        const paymentData = {
            payment_link: true,
            currency: 'USD',
            billing: billingInfo,
            customer: {
                email: customer.email,
                name: customer.name,
            },
            product_cart: [
                {
                    product_id: productId,
                    quantity: 1,
                    price: Math.round(amount * 100),
                },
            ],
            description: description || `Payment of $${amount}`,
            return_url: return_url,
            cancel_url: cancelUrl,
        };


        console.log(successUrl);

        // Create payment
        const payment = await dodoClient.payments.create(paymentData);

        if (!payment.payment_link) {
            throw new Error('Failed to generate payment link');
        }



        res.json({
            payment_url: payment.payment_link,
            payment_id: payment.payment_id,
            currency: 'USD',
            success_url: successUrl,
            cancel_url: cancelUrl,
        });
    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({
            error: 'Payment processing failed',
            message: error.message || 'An unknown error occurred',
        });
    }
});

app.get('/api/verify-dodo-payment', async (req, res) => {
    const { payment_id } = req.query;

    if (!payment_id) {
        return res.status(400).json({ error: 'Missing payment_id' });
    }

    try {
        const payment = await dodoClient.payments.retrieve(payment_id);

        if (payment.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not successful', status: payment.status });
        }

        return res.json({
            success: true,
            payment: {
                id: payment.payment_id,
                amount: payment.total_amount,
                currency: payment.currency,
                status: payment.status,
            }
        });
    } catch (err) {
        console.log(err)
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


async function addEmojisToTranscription(transcriptionArray) {
    try {
        const prompt = `For each single word below, suggest ONE MOST RELEVANT EMOJI. 
Return ONLY EMOJIS in order, one per line, no numbers or explanations.
Words:
${transcriptionArray.map(t => t.value).join('\n')}`;

        const response = await fetch(
            'https://cheta-m9rbttyh-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-4.1-nano/chat/completions?api-version=2025-01-01-preview',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': AZURE_OPENAI_API_KEY_INTERNATIONAL
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3
                })
            }
        );

        const data = await response.json();
        const emojiResponse = data?.choices?.[0]?.message?.content || '';

        const emojis = emojiResponse
            .split('\n')
            .map(line => {
                const match = line.match(/[\p{Emoji}]/gu);
                return match ? match[0] : null;
            })
            .filter(Boolean);

        // Ensure the emoji list is the same length
        const fallbackEmojis = ['✨', '🌟', '🔥', '💡', '📌', '✅', '🎯', '📍', '🌈', '💫', '🔸', '🔹'];
        while (emojis.length < transcriptionArray.length) {
            emojis.push(fallbackEmojis[Math.floor(Math.random() * fallbackEmojis.length)]);
        }

        return transcriptionArray.map((transcription, index) => ({
            ...transcription,
            value: `${transcription.value} ${emojis[index]}`
        }));
    } catch (error) {
        console.error('Error processing transcriptions:', error);
        return transcriptionArray.map(t => ({ ...t, value: `${t.value} ⚠️` }));
    }
}

// new image update 
app.post("/api/send-welcome-email", (req, res) => {
    const { email, userName } = req.body;

    const mailOptions = {
        from: '"Capsai" <ai.editor@capsai.co>',
        to: email,
        subject: 'Welcome to Capsai',
        html: ` <!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to CapsAI</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background-color: #f6f4fd;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    .header {
      background-color: #e7d9ff;
      padding: 24px 16px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      margin: 16px 0 8px;
      color: #2d0f57;
    }
    .header p {
      color: #7b679c;
      font-size: 16px;
    }
    .features {
      padding: 16px;
    }
    .features h2 {
      font-size: 20px;
      margin-bottom: 12px;
      text-align: center;
      color: #000;
    }
    .feature-box {
      background-color: #fff5e0;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    .feature-box:nth-child(2) {
      background-color: #f0e9ff;
    }
    .feature-box:nth-child(3) {
      background-color: #ffeaea;
      border: 1px solid #ff4b4b;
    }
    .feature-box h3 {
      font-size: 16px;
      margin: 0 0 4px;
      color: #333;
    }
    .feature-box p {
      margin: 0;
      font-size: 14px;
      color: #555;
    }
    .cta-section {
      background-color: #f6f4fd;
      padding: 24px 16px;
      text-align: center;
    }
    .cta-section h2 {
      font-size: 18px;
      margin-bottom: 16px;
      color: #000;
    }
    .cta-section a {
      background-color: #007bff;
      color: #fff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: bold;
      display: inline-block;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #888;
      padding: 12px 16px;
    }
    @media only screen and (max-width: 600px) {
      .container {
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to <span style="background:black;color:white;padding:0 6px;border-radius:4px">CapsAI</span></h1>
      <p>Auto-generate subtitles & add premium fonts to your videos effortlessly</p>
    </div>
    <div class="features">
      <h2>Try Exploring</h2>
      <div class="feature-box">
        <h3>✨ AI Powered Subtitle</h3>
        <p>Subtitles in All Indian Regional Languages</p>
      </div>
      <div class="feature-box">
        <h3>🤩 AI Emoji Sync</h3>
        <p>Automated emoji placement for expressive subtitles.</p>
      </div>
      <div class="feature-box">
        <h3>Smart Clips <span style="color:red;font-weight:bold;font-size:12px;">Launching Soon</span></h3>
        <p>AI-generated long form video highlights to save you time.</p>
      </div>
    </div>
    <div class="cta-section">
      <h2>🔹 Boost Your Content Quality Today! 🔹</h2>
      <a href="https://capsai.co">Get Started</a>
    </div>
    <div class="footer">
      Thanks for being part of CapsAI
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
            <p>Check out the details below and find the plan that's right for you:</p>
            <ul class="pricing-list">
                <li>Rs 29 Plan: 20 minutes, 20 days validity</li>
                <li>Rs 99 Plan: 70 minutes, 30 days validity</li>
                <li>Rs 199 Plan: 150 minutes, 45 days validity</li>
            </ul>
            <p>✨ Don't miss out on making your content shine with perfect subtitles! Start Subtitling Today!</p>
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
      await db
        .collection("verificationCodes")
        .doc(email)
        .set({
          code: verificationCode,
          expiresAt: Date.now() + 60 * 1000, 
        });
  
      
      const mailOptions = {
        from: '"Capsai" <ai.editor@capsai.co>',
        to: email,
        subject: "Your Verification Code",
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Verification Code</title>
            <style>
              html,body{margin:0;padding:0;}
              .container{display:flex;align-items:center;justify-content:center;min-height:100vh;}
            .code-box{background:#f3f0fc;padding:18px 24px;border-radius:14px;font:600 26px/1 monospace;letter-spacing:12px;color:#1a1a1a;}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="code-box">${verificationCode}</div>
          </div>
        </body>
        </html>
      `,
    };

    // nodemailer v6+ returns a Promise if no callback is supplied
    await transporter.sendMail(mailOptions);

    // 4️⃣ Single success response --------------------------------------------
    return res.status(200).json({ message: "Verification code sent" });
  } catch (err) {
    console.error("Error sending verification code:", err);
    return res
      .status(500)
      .json({ message: "Failed to send e-mail", error: err.message });
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

function extractAudioFromVideo(videoFilePath, audioFilePath) {
    return new Promise((resolve, reject) => {

        const command = `ffmpeg -i "${videoFilePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioFilePath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error extracting audio:', stderr);
                reject(error);
            } else {
                console.log('Audio extracted successfully:', audioFilePath);
                resolve(audioFilePath);
            }
        });
    });
}

async function callWhisper(audioFilePath, isoneWord) {
    console.log(audioFilePath);
    const url = `https://capsaiendpoint.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-02-15-preview`; // Changed to transcriptions and updated API version

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath), { filename: 'audio.wav' });
    formData.append('response_format', 'verbose_json');

    if (isoneWord) {
        formData.append('timestamp_granularities[]', 'word');
    }

    const headers = {
        ...formData.getHeaders(),
        'api-key': AZURE_OPENAI_API_KEY,
    };

    try {
        const response = await axios.post(url, formData, { headers });

        // Process word-level timestamps
        if (response.data.words) {
            response.data.words.forEach(word => {
                console.log(`Word: ${word.word} | Start: ${word.start} | End: ${word.end}`);
            });
        } else {
            console.log('No word-level timestamps in response:', response.data);
        }

        return response.data;
    } catch (error) {
        console.error('Error calling Whisper:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function processVideoInput(videoFilePath, isoneWord) {
    console.log('IN Code')
    try {

        console.log('Extracting audio from video...');
        const audioFilePath = 'uploads/extracted-audio.wav';
        await extractAudioFromVideo(videoFilePath, audioFilePath);
        // one word stucking after audio extraction 


        console.log('Sending audio to Whisper API...');
        const srtContent = await callWhisper(audioFilePath, isoneWord);
        console.log('Whisper Transcription (SRT):\n', srtContent);


        fs.unlinkSync(audioFilePath);
        console.log('Temporary audio file deleted.');

        return srtContent;
    } catch (error) {
        console.error('Error processing video input:', error);
        throw error;
    }
}

function generateSRTFromWords(words) {
    let srt = '';
    let counter = 1;

    words.forEach(word => {
        srt += `${counter}\n`;
        srt += `${formatTime(word.start)} --> ${formatTime(word.end)}\n`;
        srt += `${word.word}\n\n`;
        counter++;
    });

    return srt;
}

function generateSRTNormal(segments, wordLimit) {
    let srt = '';
    let index = 1;

    const validSegments = Array.isArray(segments) ? segments : [];

    validSegments.forEach((segment) => {
        if (
            !segment?.text ||
            typeof segment.start === 'undefined' ||
            typeof segment.end === 'undefined'
        ) {
            return;
        }

        const words = segment.text.split(' ').filter(word => word.trim() !== '');
        const totalWords = words.length;
        const segmentDuration = segment.end - segment.start;

        if (totalWords === 0 || segmentDuration <= 0) return;

        if (wordLimit === 1) {
            // Equal time distribution for each word
            const wordDuration = segmentDuration / totalWords;

            words.forEach((word, i) => {
                const startTime = segment.start + (i * wordDuration);
                const endTime = segment.start + ((i + 1) * wordDuration);

                srt += `${index}\n${secondsToSRTTime(startTime)} --> ${secondsToSRTTime(endTime)}\n${word}\n\n`;
                index++;
            });
        } else {
            // Existing logic for multi-word subtitles
            for (let i = 0; i < totalWords; i += wordLimit) {
                const chunk = words.slice(i, i + wordLimit).join(' ');
                const chunkStart = segment.start + (i / totalWords) * segmentDuration;
                const chunkEnd = segment.start + ((i + wordLimit) / totalWords) * segmentDuration;

                srt += `${index}\n${secondsToSRTTime(chunkStart)} --> ${secondsToSRTTime(chunkEnd)}\n${chunk}\n\n`;
                index++;
            }
        }
    });

    return srt;
}




function formatTime(seconds) {
    const date = new Date(0);
    date.setSeconds(Math.floor(seconds));
    date.setMilliseconds((seconds % 1) * 1000);
    return date.toISOString().substring(11, 23).replace('.', ',');
}





async function callGPT4(language, changetext) {
    let prompt;

    if (language === 'Hindi') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Hindi using pure Devanagari script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'English') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to English. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Urdu') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Urdu using pure Urdu script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Bengali') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Bengali using pure Bengali script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Telugu') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Telugu using pure Telugu script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Marathi') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Marathi using pure Marathi script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Tamil') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Tamil using pure Tamil script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Gujarati') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Gujarati using pure Gujarati script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Kannada') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Kannada using pure Kannada script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Punjabi') {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to Punjabi using pure Gurmukhi script. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else if (language === 'Hinglish') {
        prompt = `You are a professional subtitle translator. Convert the following Hindi subtitles to Hinglish (Hindi spoken in Roman script). Preserve the original SRT format strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    } else {
        prompt = `You are a professional subtitle translator. Convert the following subtitles to ${language}. Maintain the original SRT formatting strictly — including the sequence numbers, time codes, and line breaks. Do not omit or change any content. Return only the translated subtitles in plain SRT format without any explanations, code blocks, or additional notes:\n\n${changetext}`;
    }

    const url = `https://cheta-m9rbttyh-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2025-01-01-preview`;

    const data = {
        messages: [
            { role: 'user', content: prompt }
        ],
    };

    const headers = {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY_INTERNATIONAL,
    };

    try {
        const response = await axios.post(url, data, { headers });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling GPT-4:', error.response ? error.response.data : error.message);
        throw error;
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

const VideoEmojiprocessing = async (assFilePath, videoPath, watermarkPath, resWidth, resHeight) => {
    console.log("Emoji processing started");
    try {
        const { subtitles } = parseASS(assFilePath, emojiMapping, assFilePath);
        const outputFilePath = path.join(__dirname, 'uploads', `emojitempoutput_${Date.now()}.mp4`);

        const emojiMap = new Map();
        const overlayCommands = [];
        const emojiInputs = [];
        let overlayIndex = 0;


        for (const subtitle of subtitles) {

            const validEmojis = subtitle.emojis.filter(emoji => {
                const emojiPng = emojiMapping[emoji] ? path.join(__dirname, emojiMapping[emoji]) : null;
                return emojiPng && fs.existsSync(emojiPng);
            });

            for (const emoji of validEmojis) {
                const emojiPng = path.join(__dirname, emojiMapping[emoji]);
                if (!emojiMap.has(emojiPng)) {
                    emojiMap.set(emojiPng, emojiInputs.length + 1);
                    emojiInputs.push(`-i "${emojiPng}"`);
                }

                const startTime = timeToSeconds(subtitle.start);
                const endTime = timeToSeconds(subtitle.end);
                const emojiSize = 45;
                const emojiX = `${subtitle.x} - ${emojiSize}`;
                const emojiY = `${subtitle.y} - 400`;

                overlayCommands.push({
                    inputIndex: emojiMap.get(emojiPng),
                    command: `[${emojiMap.get(emojiPng)}:v]scale=${emojiSize}:${emojiSize}[emoji${overlayIndex}];
                      [tmp${overlayIndex}][emoji${overlayIndex}]overlay=x='${emojiX}':y='${emojiY}':enable='between(t,${startTime},${endTime})'[tmp${overlayIndex + 1}];`
                });
                overlayIndex++;
            }
        }


        let filterComplex = `[0:v]scale=${resWidth}:${resHeight}[tmp0];`;

        if (overlayCommands.length > 0) {
            overlayCommands.forEach((overlay, index) => {
                filterComplex += overlay.command.replace('[scaled]', `[tmp${index}]`);
            });
        }

        filterComplex += `[tmp${overlayCommands.length}]subtitles=${assFilePath}:force_style='FontSize=18'[final];`;

        const ffmpegCommand = `ffmpeg -i "${videoPath}" ${emojiInputs.join(' ')} -filter_complex "${filterComplex}" -map "[final]" -map 0:a -c:a copy -preset veryfast -y "${outputFilePath}"`;

        const maxExecutionTime = 300000;
        const ffmpegProcess = exec(ffmpegCommand, { maxBuffer: 1024 * 1024 * 10 });

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


function processShuffledText(wordLayout, videoPath, srtFilePath, outputPath, isoneWord) {
    if (wordLayout === "Shuffled text") {
        console.log("IN SHUFFLE");
        let command;
        if (isoneWord) {
            command = `/home/saksham/virtual/venv/bin/python3 /home/saksham/virtual/script2.py ${`/home/saksham/Caps/aws-deploy/whisper-backend/${videoPath}`} ${srtFilePath} ${`/home/saksham/Caps/aws-deploy/whisper-backend/${outputPath}`}`;
        } else {
            command = `/home/saksham/virtual/venv/bin/python3 /home/saksham/virtual/script3.py ${`/home/saksham/Caps/aws-deploy/whisper-backend/${videoPath}`} ${srtFilePath} ${`/home/saksham/Caps/aws-deploy/whisper-backend/${outputPath}`}`;
        }
        execSync(command)

        return 1;
    }
}


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




// New Remotion-based video processing endpoint
app.post('/api/change-style-remotion', upload.single('video'), handleMulterError, async (req, res) => {
    try {
        if (req.body.deletion) {
            // Handle deletion logic (same as original)
            if (req.get('X-CloudScheduler') !== 'true') {
                console.error('Unauthorized deletion attempt');
                return res.status(403).json({ error: 'Unauthorized' });
            }

            const receivedSignature = req.get('X-Signature');
            const expectedSignature = crypto
                .createHmac('sha256', process.env.SCHEDULER_SECRET)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (receivedSignature !== expectedSignature) {
                console.error('Invalid signature:', { receivedSignature, expectedSignature });
                return res.status(403).json({ error: 'Invalid signature' });
            }

            if (req.body.deleteType === 'azure-blob') {
                await deleteFromAzure(req.body.containerName, req.body.blobName);
                console.log(`Deleted Azure blob: ${req.body.blobName}`);
            }
            else if (req.body.deleteType === 'firestore-doc') {
                const docRef = admin.firestore().doc(req.body.docPath);
                await docRef.delete();
                console.log(`Deleted Firestore document: ${req.body.docPath}`);
            }

            return res.status(204).end();
        }

        const { inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize, userdata, uid, save, keyS3, transcriptions, isOneword, videoResolution, soundEffects } = req.body;
        
        if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize || !userdata || !uid) {
            return res.status(400).json({ error: 'Missing required fields in the request body' });
        }

        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.png');
        const videoPath = inputVideo;
        
        // Process subtitles for Remotion
        const processedSubtitles = remotionService.processSubtitles(transcriptions, isOneword);
        
        // Process sound effects for Remotion
        const processedSoundEffects = remotionService.processSoundEffects(soundEffects || []);

        // Set up output path
        const outputFilePath = path.join(__dirname, 'uploads', `remotion_${Date.now()}.mp4`);

        // Calculate remaining minutes
        let remainingMins = 0;
        const videoDuration = await getVideoDuration(videoPath);

        if (userdata.usertype === 'free') {
            if (videoDuration > 3) {
                return res.status(400).json({ error: 'Video length exceeds 3 minutes limit for free users' });
            }
            remainingMins = userdata.videomins - videoDuration;
        } else {
            remainingMins = userdata.videomins - videoDuration;
        }

        // Render video with Remotion
        console.log('Starting Remotion video processing...');
        const renderResult = await remotionService.renderVideo({
            videoSrc: videoPath,
            subtitles: processedSubtitles,
            font: {
                fontFamily: font.fontFamily || 'Arial',
                fontSize: parseInt(font.fontSize) || 32, // Increased default size
                color: color,
                fontWeight: font.fontWeight || 'normal',
                fontStyle: font.fontStyle || 'normal',
                textShadow: font.textShadow,
                webkitTextStrokeWidth: font.webkitTextStrokeWidth,
                webkitTextStrokeColor: font.webkitTextStrokeColor,
                letterSpacing: font.letterSpacing,
                padding: font.padding,
            },
            watermark: userdata.usertype === 'free' ? watermarkPath : null,
            soundEffects: processedSoundEffects,
            userType: userdata.usertype,
            videoResolution: videoResolution,
            yPosition: yPosition,
            outputPath: outputFilePath,
            fps: 24, // Optimized for smooth rendering
            quality: 75, // Balanced quality for performance
        });

        if (!renderResult.success) {
            throw new Error('Remotion rendering failed');
        }

        // Upload to Azure
        let outputUpload;
        let outputVideoUrl;

        if (save) {
            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;

            // Set up deletion tasks
            await db.collection('deletionTasks').add({
                type: 'azure-blob',
                containerName: 'capsuservideos',
                blobName: keyS3,
                deleteAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (userdata.usertype === 'free' ? 15 : 20) * 60000)
                )
            });

            await db.collection('deletionTasks').add({
                type: 'azure-blob',
                containerName: 'capsuservideos',
                blobName: outputUpload.blobName,
                deleteAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (userdata.usertype === 'free' ? 15 : 20) * 60000)
                )
            });

            // Save to Firestore
            const newDocRef = await db.collection('users').doc(uid).collection('videos').add({
                videoUrl: videoPath,
                srt: srtUrl,
                fontadded: font,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                key: keyS3,
                transcriptions: transcriptions,
                processedWith: 'remotion'
            });

            await db.collection('deletionTasks').add({
                type: 'firestore-doc',
                docPath: `users/${uid}/videos/${newDocRef.id}`,
                deleteAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (userdata.usertype === 'free' ? 15 : 20) * 60000))
            });
        } else {
            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;
        }

        // Update user video minutes
        const userRef = db.collection('users').doc(uid);
        const exact = remainingMins <= 0 ? 0 : remainingMins.toFixed(1);
        
        await userRef.update({
            videomins: exact,
        });

        // Clean up temporary files
        if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
        }

        console.log('Remotion video processing completed successfully');
        res.json({ 
            videoUrl: outputVideoUrl,
            processedWith: 'remotion',
            renderTime: renderResult.renderTime,
            success: true
        });

    } catch (error) {
        console.error('Error in Remotion video processing:', error);
        res.status(500).json({ 
            error: error.message,
            processedWith: 'remotion',
            success: false
        });
    }
});

// Test endpoint for Remotion service
app.post('/api/test-remotion', async (req, res) => {
  let remotionService;
  
  try {
    console.log('Testing Remotion service...');
    
    // Test with a real Azure URL to verify download functionality
    const testData = {
      videoSrc: req.body.videoUrl || null, // Allow testing with real URLs
      subtitles: [
        {
          id: 1,
          timeStart: "00:00:00,000",
          timeEnd: "00:00:03,000",
          value: "Hello World! 🎉"
        },
        {
          id: 2,
          timeStart: "00:00:03,000", 
          timeEnd: "00:00:06,000",
          value: "This is a test subtitle! 🚀"
        }
      ],
      font: {
        fontFamily: 'Arial',
        fontSize: 56, // Increased size for better visibility
        color: '#ffffff',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      },
      watermark: null,
      soundEffects: [],
      userType: 'free',
      videoResolution: '16:9',
      yPosition: 100
    };
    
    const outputPath = path.join(__dirname, 'out', `test-${Date.now()}.mp4`);
    
    remotionService = new RemotionVideoService();
    
    // Clean up old downloads first
    await remotionService.cleanupOldDownloads();
    
    const result = await remotionService.renderVideo({
      ...testData,
      outputPath,
      fps: 24, // Optimized for smooth rendering
      quality: 75, // Balanced quality for performance
    });
    
    console.log('Remotion test completed successfully');
    
    // Clean up the downloaded video file if it exists
    if (result.downloadedVideoPath) {
      remotionService.cleanupDownloadedVideo(result.downloadedVideoPath);
    }
    
    res.json({ 
      success: true, 
      message: 'Remotion test completed',
      outputPath: result.outputPath,
      downloadedVideo: !!req.body.videoUrl,
      hadDownloadedVideo: !!result.downloadedVideoPath
    });
    
  } catch (error) {
    console.error('Error in Remotion test:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Remotion test failed',
      details: error.message,
      stack: error.stack
    });
  } finally {
    // Clean up service
    if (remotionService) {
      await remotionService.cleanup();
    }
  }
});
app.listen(3000, () => console.log('Server running on port 3000'));

// Cleanup function for uploads directory
async function cleanupUploadsDirectory() {
    try {
        const uploadsDir = 'uploads/';
        if (!fs.existsSync(uploadsDir)) {
            return;
        }

        const files = fs.readdirSync(uploadsDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            
            // Delete files older than 30 minutes
            if (now - stats.mtime.getTime() > maxAge) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up old file: ${file}`);
                } catch (error) {
                    console.error(`Error deleting file ${file}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error during uploads cleanup:', error);
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupUploadsDirectory, 10 * 60 * 1000);

// Initial cleanup on server start
cleanupUploadsDirectory();

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    
    // Handle specific error types
    if (error.code === 'ENOSPC') {
        return res.status(500).json({ 
            error: 'Server storage is full. Please try again later.' 
        });
    }
    
    if (error.code === 'ENOMEM') {
        return res.status(500).json({ 
            error: 'Server memory limit exceeded. Please try with a smaller video file.' 
        });
    }
    
    // Default error response
    res.status(500).json({ 
        error: 'An unexpected error occurred. Please try again.' 
    });
});

// Handle 404 errors
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(3000, () => console.log('Server running on port 3000'));
