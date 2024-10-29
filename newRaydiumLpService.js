const { Connection, PublicKey } = require('@solana/web3.js');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const connection = new Connection(process.env.SOLANA_WS_URL, 'confirmed');
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey(process.env.RAYDIUM_AMM_PROGRAM_ID);

let db;  // To store the database instance

// Function to connect to MongoDB
async function connectToDatabase() {
    const mongoUri = process.env.MONGO_URI;
    const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        db = client.db('bot');  // Change 'bot' to your preferred database name
        console.log("Connected to MongoDB successfully.");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);  // Exit if MongoDB connection fails
    }
}

// Function to save data to MongoDB
async function saveToMongo(tokenData) {
    try {
        if (!db) {
            throw new Error('Database connection is not initialized');
        }

        const collection = db.collection('raydium_lp_transactions');  // Change collection name as needed
        const result = await collection.insertOne(tokenData);

        if (result.acknowledged) {
            console.log('Token data saved to MongoDB:', result.insertedId);
        } else {
            console.error('Failed to save token data to MongoDB.');
        }
    } catch (error) {
        console.error('Error saving token data to MongoDB:', error.message);
    }
}

// Function to process Raydium LP transaction
async function processRaydiumLpTransaction(connection, signature) {
    try {
        // Fetch the transaction details
        const transactionDetails = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (transactionDetails) {
            const message = transactionDetails.transaction.message;
            const accounts = message.accountKeys.map(key => key.toString());

            console.log("Transaction Message:", message);
            console.log("Accounts:", accounts);

            // Iterate over the instructions to find the LP creation instruction
            for (const ix of message.instructions) {
                const programId = accounts[ix.programIdIndex];

                // Check if this instruction is from the Raydium AMM program
                if (programId === RAYDIUM_AMM_PROGRAM_ID.toString() && ix.data.length > 0) {
                    // Extract account indices based on the LP creation instruction
                    const mint0 = accounts[ix.accounts[8]];  // Base token mint
                    const mint1 = accounts[ix.accounts[9]];  // Quote token mint
                    const lpTokenMint = accounts[ix.accounts[7]];  // LP token mint

                    const deployer = accounts[ix.accounts[17]];  // Deployer's address
                    const poolId = accounts[ix.accounts[4]];  // AMM pool ID
                    const baseVault = accounts[ix.accounts[10]];  // Base token vault
                    const quoteVault = accounts[ix.accounts[11]];  // Quote token vault

                    const ammAuthority = accounts[ix.accounts[5]];  // AMM authority
                    const ammTarget = accounts[ix.accounts[13]];  // AMM target orders
                    const ammOpenOrder = accounts[ix.accounts[6]];  // AMM open orders
                    const marketProgram = accounts[ix.accounts[15]];  // Serum market program
                    const marketId = accounts[ix.accounts[16]];  // Serum market ID

                    // Prepare token data for MongoDB
                    const tokenData = {
                        programId: new PublicKey(accounts[ix.accounts[0]]).toString(),
                        ammId: new PublicKey(poolId).toString(),
                        ammAuthority: new PublicKey(ammAuthority).toString(),
                        ammOpenOrders: new PublicKey(ammOpenOrder).toString(),
                        lpMint: new PublicKey(lpTokenMint).toString(),
                        coinMint: new PublicKey(mint0).toString(),
                        pcMint: new PublicKey(mint1).toString(),
                        coinVault: new PublicKey(baseVault).toString(),
                        pcVault: new PublicKey(quoteVault).toString(),
                        ammTargetOrders: new PublicKey(ammTarget).toString(),
                        serumMarket: new PublicKey(marketId).toString(),
                        serumProgram: new PublicKey(marketProgram).toString(),
                        deployer: new PublicKey(deployer).toString()
                    };

                    // Save token data to MongoDB
                    await saveToMongo(tokenData);

                    return tokenData;
                }
            }
        } else {
            console.error('No transaction details found for signature:', signature);
        }
    } catch (error) {
        console.error('Error fetching/processing transaction:', error.message);
    }
}

module.exports = {
    connectToDatabase,
    processRaydiumLpTransaction
};
