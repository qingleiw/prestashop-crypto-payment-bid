const { Core } = require('@walletconnect/core');
const { buildApprovedNamespaces, getSdkError } = require('@walletconnect/utils');
const { SignClient } = require('@walletconnect/sign-client');

// WalletConnect v2 Service for MetaMask integration
class WalletConnectService {
    constructor() {
        this.core = null;
        this.signClient = null;
        this.sessions = new Map();
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            // Initialize WalletConnect Core
            this.core = new Core({
                projectId: process.env.WALLETCONNECT_PROJECT_ID || 'demo-project-id',
                relayUrl: 'wss://relay.walletconnect.com'
            });

            // Initialize Sign Client
            this.signClient = await SignClient.init({
                core: this.core,
                metadata: {
                    name: 'CryptoPay Pro',
                    description: 'Cryptocurrency Payment Gateway',
                    url: process.env.APP_URL || 'https://cryptopay.pro',
                    icons: ['https://cryptopay.pro/icon.png']
                }
            });

            this.setupEventListeners();
            this.initialized = true;
            console.log('WalletConnect v2 initialized');

        } catch (error) {
            console.error('Failed to initialize WalletConnect:', error);
            throw error;
        }
    }

    setupEventListeners() {
        if (!this.signClient) return;

        // Listen for session proposals
        this.signClient.on('session_proposal', async (event) => {
            console.log('WalletConnect: Session proposal received', event);

            try {
                const { id, params } = event;
                const { requiredNamespaces } = params;

                // Build approved namespaces
                const approvedNamespaces = buildApprovedNamespaces({
                    proposal: params,
                    supportedNamespaces: {
                        eip155: {
                            chains: ['eip155:1', 'eip155:56'], // ETH and BSC
                            methods: ['eth_sendTransaction', 'personal_sign', 'eth_sign'],
                            events: ['accountsChanged', 'chainChanged'],
                            accounts: [
                                'eip155:1:' + process.env.ETH_ADDRESS,
                                'eip155:56:' + process.env.BSC_ADDRESS
                            ].filter(Boolean)
                        }
                    }
                });

                // Approve session
                await this.signClient.approve({
                    id,
                    namespaces: approvedNamespaces
                });

                console.log('WalletConnect: Session approved');

            } catch (error) {
                console.error('WalletConnect: Failed to approve session:', error);
                await this.signClient.reject({
                    id: event.id,
                    reason: getSdkError('USER_REJECTED')
                });
            }
        });

        // Listen for session requests
        this.signClient.on('session_request', async (event) => {
            console.log('WalletConnect: Session request received', event);

            const { topic, params, id } = event;
            const { request } = params;
            const requestSession = this.signClient.session.get(topic);

            try {
                // Handle different request types
                switch (request.method) {
                    case 'eth_sendTransaction':
                        await this.handleSendTransaction(request, id, topic);
                        break;
                    case 'personal_sign':
                        await this.handlePersonalSign(request, id, topic);
                        break;
                    default:
                        throw new Error(`Unsupported method: ${request.method}`);
                }

            } catch (error) {
                console.error('WalletConnect: Failed to handle request:', error);
                await this.signClient.respond({
                    topic,
                    response: {
                        id,
                        jsonrpc: '2.0',
                        error: {
                            code: -32000,
                            message: error.message
                        }
                    }
                });
            }
        });

        // Listen for session deletions
        this.signClient.on('session_delete', (event) => {
            console.log('WalletConnect: Session deleted', event);
            this.sessions.delete(event.topic);
        });
    }

    // Create connection URI for MetaMask
    async createConnection() {
        await this.init();

        try {
            const { uri, approval } = await this.signClient.connect({
                requiredNamespaces: {
                    eip155: {
                        methods: ['eth_sendTransaction', 'personal_sign', 'eth_sign'],
                        chains: ['eip155:1', 'eip155:56'],
                        events: ['accountsChanged', 'chainChanged']
                    }
                }
            });

            // Wait for approval
            const sessionNamespace = await approval();
            this.sessions.set(sessionNamespace.topic, sessionNamespace);

            return {
                uri,
                session: sessionNamespace
            };

        } catch (error) {
            console.error('WalletConnect: Failed to create connection:', error);
            throw error;
        }
    }

    // Handle transaction signing
    async handleSendTransaction(request, id, topic) {
        console.log('WalletConnect: Handling send transaction', request);

        const { params } = request;
        const transaction = params[0];

        // Validate transaction
        const validation = await this.validateTransaction(transaction);
        if (!validation.valid) {
            throw new Error(`Invalid transaction: ${validation.error}`);
        }

        // In production, you would:
        // 1. Store transaction for user approval
        // 2. Wait for user confirmation
        // 3. Sign and broadcast

        // For demo purposes, we'll simulate approval
        const signedTx = await this.signTransaction(transaction);

        await this.signClient.respond({
            topic,
            response: {
                id,
                jsonrpc: '2.0',
                result: signedTx
            }
        });
    }

    // Handle personal sign requests
    async handlePersonalSign(request, id, topic) {
        console.log('WalletConnect: Handling personal sign', request);

        const { params } = request;
        const [message, address] = params;

        // Validate the signing request
        const validation = await this.validateSignRequest(message, address);
        if (!validation.valid) {
            throw new Error(`Invalid sign request: ${validation.error}`);
        }

        // Sign the message
        const signature = await this.signMessage(message, address);

        await this.signClient.respond({
            topic,
            response: {
                id,
                jsonrpc: '2.0',
                result: signature
            }
        });
    }

    // Validate transaction parameters
    async validateTransaction(tx) {
        try {
            // Basic validation
            if (!tx.to || !tx.value) {
                return { valid: false, error: 'Missing required fields' };
            }

            // Check if address is in our whitelist
            const allowedAddresses = [
                process.env.ETH_ADDRESS,
                process.env.BSC_ADDRESS
            ].filter(Boolean);

            if (!allowedAddresses.includes(tx.to.toLowerCase())) {
                return { valid: false, error: 'Address not whitelisted' };
            }

            // Check value limits (anti-money laundering)
            const valueEth = parseFloat(tx.value) / 1e18;
            if (valueEth > 100) { // Example limit
                return { valid: false, error: 'Transaction value exceeds limit' };
            }

            return { valid: true };

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    // Validate sign request
    async validateSignRequest(message, address) {
        try {
            // Check if address is authorized
            const allowedAddresses = [
                process.env.ETH_ADDRESS,
                process.env.BSC_ADDRESS
            ].filter(Boolean);

            if (!allowedAddresses.includes(address.toLowerCase())) {
                return { valid: false, error: 'Address not authorized' };
            }

            // Validate message format (should be our specific format)
            if (!message.includes('CryptoPay') && !message.includes('Order')) {
                return { valid: false, error: 'Invalid message format' };
            }

            return { valid: true };

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    // Sign transaction (mock implementation)
    async signTransaction(tx) {
        // In production, this would use a secure HSM or wallet
        console.log('WalletConnect: Signing transaction (mock)', tx);

        // Return mock signed transaction
        return '0x' + Math.random().toString(16).substr(2, 64);
    }

    // Sign message (mock implementation)
    async signMessage(message, address) {
        // In production, this would use a secure HSM or wallet
        console.log('WalletConnect: Signing message (mock)', message);

        // Return mock signature
        return '0x' + Math.random().toString(16).substr(2, 130);
    }

    // Get active sessions
    getActiveSessions() {
        return Array.from(this.sessions.values());
    }

    // Disconnect session
    async disconnect(topic) {
        try {
            await this.signClient.disconnect({
                topic,
                reason: getSdkError('USER_DISCONNECTED')
            });
            this.sessions.delete(topic);
            return { success: true };
        } catch (error) {
            console.error('WalletConnect: Failed to disconnect:', error);
            return { success: false, error: error.message };
        }
    }

    // Get connection status
    getStatus() {
        return {
            initialized: this.initialized,
            activeSessions: this.sessions.size,
            sessions: Array.from(this.sessions.keys())
        };
    }
}

// Export singleton instance
const walletConnectService = new WalletConnectService();

module.exports = {
    WalletConnectService,
    walletConnectService
};