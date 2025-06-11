app.post('/api/process-video', upload.single('video'), async (req, res) => {
    try {
        const videoFilePath = req.file.path;
        console.log(videoFilePath);
        const language = req.body.SelectedLang;
        const isoneWord = req.body.WordLimit === 'true';
        const wordLayout = req.body.WordLayout;

        const originalFilename = req.file.originalname;

        console.log(isoneWord, "from front");
        let remaningmins = 0;
        const outputPath = `${videoFilePath}_random.mp4`;
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

        if (directLanguages.includes(language) && transcription.language.toLowerCase() === language.toLowerCase()) {
            outputSrt = srtContent;
        } else if (supportedLanguages.includes(language)) {
            outputSrt = srtContent;
        } else {
            console.log('Called');
            outputSrt = await callGPT4(language, srtContent);
        }


        const originalNameWithoutExt = originalFilename.replace(/\.[^/.]+$/, "");
        const srtFilePath = path.join(__dirname, 'uploads', `${originalNameWithoutExt}.srt`);
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


        fs.unlinkSync(srtFilePath);
        if (wordLayout == 'Shuffled text') {
            fs.unlinkSync(outputPath);
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
        res.status(500).json({ error: error.message });
    }
});