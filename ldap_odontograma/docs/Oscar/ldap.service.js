import { Client } from "ldapts";

class LdapService {

    constructor() {
        this.host = process.env.LDAP_HOST;
        this.port = process.env.LDAP_PORT;
        this.adminUser = process.env.LDAP_USUARIO_DN;
        this.adminPass = process.env.LDAP_PASSWORD;
        this.baseDN = process.env.LDAP_BASE_DN || "dc=junaeb,dc=local";
    }

    /**
     * Build LDAP client configuration
     * @private
     * @returns {Object} Client configuration object
     */
    _buildClientConfig() {
        // Clean host and determine protocol
        let cleanHost = this.host.replace('ldap://', '').replace('ldaps://', '');
        const protocol = this.port === '636' ? 'ldaps' : 'ldap';
        const url = `${protocol}://${cleanHost}:${this.port}`;

        const config = {
            url: url,
            connectTimeout: 5000,
            timeout: 5000
        };

        // Only add TLS options for ldaps protocol
        if (protocol === 'ldaps') {
            config.tlsOptions = { rejectUnauthorized: false };
        }

        return config;
    }

    /**
     * Authenticate user against LDAP
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} { success: boolean, user?: Object, error?: Error }
     */
    async authenticate(email, password) {
        const config = this._buildClientConfig();
        const userClient = new Client(config);

        try {
            // First, find the user to get their DN
            const userFound = await this.findUserByEmail(email);
            if (!userFound.success) {
                const error = new Error("Usuario no encontrado en LDAP");
                error.code = 32;
                error.name = "NoSuchObjectError";
                throw error;
            }

            // Attempt bind with user's DN and provided password
            await userClient.bind(userFound.user.dn, password);
            await userClient.unbind();

            return { success: true, user: userFound.user };
        } catch (error) {
            console.error('Error de autenticación LDAP:', error.message);
            return { success: false, error: error };
        } finally {
            try {
                await userClient.unbind();
            } catch (e) { }
        }
    }

    /**
     * Find user by email in LDAP
     * @param {string} email - User email
     * @returns {Promise<Object>} { success: boolean, user?: Object, error?: Error }
     */
    async findUserByEmail(email) {
        const config = this._buildClientConfig();
        const client = new Client(config);
        console.log(`[LDAP] Buscando usuario: ${email}`)
        console.log(`[LDAP] Conectando a: ${config.url}`)
        console.log(`[LDAP] Base DN: ${this.baseDN}`)

        try {
            // Bind as admin to search for user
            console.log(`[LDAP] Intentando bind como admin...`)
            await client.bind(this.adminUser, this.adminPass);
            console.log(`[LDAP] Bind admin OK, buscando...`)

            // Search for user by email and user have to be active
            const { searchEntries } = await client.search(this.baseDN, {
                scope: "sub",
                filter: `(&(mail=${email}))`, // 
                attributes: ["dn", "mail", "sAMAccountName", "department", "displayName", "userPrincipalName", "userAccountControl"], // agregar el estado si es necesario
            });
            console.log('LDAP search entries:', searchEntries);

            if (!searchEntries || searchEntries.length === 0) {
                return { success: false, error: new Error("Usuario no encontrado en LDAP") };
            }

            return { success: true, user: searchEntries[0] };
        } catch (error) {
            console.error('Error al buscar usuario en LDAP:', error.message);
            return { success: false, error: error };
        } finally {
            try {
                await client.unbind();
            } catch (e) { }
        }
    }

    /**
     * Check LDAP connection health
     * @returns {Promise<boolean>} true if connection successful
     */
    async checkConnection() {
        const config = this._buildClientConfig();
        const client = new Client(config);

        try {
            await client.bind(this.adminUser, this.adminPass);
            await client.unbind();
            return true;
        } catch (e) {
            console.error('Error de conexión LDAP:', e.message);
            return false;
        }
    }
}

export default LdapService;
