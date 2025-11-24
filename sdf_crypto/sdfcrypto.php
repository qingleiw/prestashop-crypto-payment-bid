<?php
/**
 * SDF Crypto Payment Module for PrestaShop 8.x
 * Handles OURTOKEN (BSC) and USDC (ETH) payments
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class SdfCrypto extends PaymentModule
{
    public function __construct()
    {
        $this->name = 'sdfcrypto';
        $this->tab = 'payments_gateways';
        $this->version = '1.0.0';
        $this->author = 'Your Name';
        $this->need_instance = 1;
        $this->ps_versions_compliancy = ['min' => '8.0', 'max' => _PS_VERSION_];
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('SDF Crypto Payments');
        $this->description = $this->l('Accept OURTOKEN and USDC payments with deterministic addresses');
        $this->confirmUninstall = $this->l('Are you sure you want to uninstall?');
    }

    public function install()
    {
        if (!parent::install() ||
            !$this->registerHook('paymentOptions') ||
            !$this->registerHook('paymentReturn') ||
            !$this->registerHook('displayAdminOrder') ||
            !$this->registerHook('displayHeader')) {
            return false;
        }

        // Create database tables
        $this->createTables();

        return true;
    }

    public function uninstall()
    {
        if (!parent::uninstall()) {
            return false;
        }

        // Drop tables
        $this->dropTables();

        return true;
    }

    private function createTables()
    {
        $sql = "
            CREATE TABLE IF NOT EXISTS `" . _DB_PREFIX_ . "crypto_order_addr` (
                `id` int(11) NOT NULL AUTO_INCREMENT,
                `order_id` int(11) NOT NULL,
                `chain` varchar(10) NOT NULL,
                `asset` varchar(20) NOT NULL,
                `address` varchar(100) NOT NULL,
                `derivation_path` varchar(50) NOT NULL,
                `expected_amt_asset` decimal(20,8) NOT NULL,
                `expected_amt_eur` decimal(20,2) NOT NULL,
                `price_source` varchar(50) NOT NULL,
                `expires_at` datetime NOT NULL,
                `status` varchar(20) DEFAULT 'pending',
                `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `order_chain` (`order_id`, `chain`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8;

            CREATE TABLE IF NOT EXISTS `" . _DB_PREFIX_ . "crypto_tx` (
                `id` int(11) NOT NULL AUTO_INCREMENT,
                `order_id` int(11) NOT NULL,
                `type` enum('payment','sweep','refund') NOT NULL,
                `tx_hash` varchar(100) NOT NULL,
                `block_height` int(11) NOT NULL,
                `block_time` datetime NOT NULL,
                `amount_asset` decimal(20,8) NOT NULL,
                `amount_eur` decimal(20,2) NOT NULL,
                `price_source` varchar(50) NOT NULL,
                `meta_json` text,
                `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `tx_hash` (`tx_hash`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8;

            CREATE TABLE IF NOT EXISTS `" . _DB_PREFIX_ . "crypto_wallet_link` (
                `id` int(11) NOT NULL AUTO_INCREMENT,
                `customer_id` int(11) NOT NULL,
                `chain_family` varchar(10) NOT NULL,
                `address` varchar(100) NOT NULL,
                `default_for_refunds` tinyint(1) DEFAULT 0,
                `consent_ts` datetime NOT NULL,
                PRIMARY KEY (`id`),
                UNIQUE KEY `customer_chain` (`customer_id`, `chain_family`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
        ";

        return Db::getInstance()->execute($sql);
    }

    private function dropTables()
    {
        $sql = "
            DROP TABLE IF EXISTS `" . _DB_PREFIX_ . "crypto_order_addr`;
            DROP TABLE IF EXISTS `" . _DB_PREFIX_ . "crypto_tx`;
            DROP TABLE IF EXISTS `" . _DB_PREFIX_ . "crypto_wallet_link`;
        ";

        return Db::getInstance()->execute($sql);
    }

    public function hookPaymentOptions($params)
    {
        if (!$this->active) {
            return [];
        }

        $options = [];

        // OURTOKEN option
        $ourTokenOption = new PrestaShop\PrestaShop\Core\Payment\PaymentOption();
        $ourTokenOption->setCallToActionText($this->l('Pay with OURTOKEN (BSC)'))
            ->setAction($this->context->link->getModuleLink($this->name, 'payment', ['asset' => 'OURTOKEN'], true))
            ->setAdditionalInformation($this->fetchTemplate('views/templates/hook/payment_ourtoken.tpl'));
        $options[] = $ourTokenOption;

        // USDC option
        $usdcOption = new PrestaShop\PrestaShop\Core\Payment\PaymentOption();
        $usdcOption->setCallToActionText($this->l('Pay with USDC (ETH)'))
            ->setAction($this->context->link->getModuleLink($this->name, 'payment', ['asset' => 'USDC'], true))
            ->setAdditionalInformation($this->fetchTemplate('views/templates/hook/payment_usdc.tpl'));
        $options[] = $usdcOption;

        return $options;
    }

    public function hookPaymentReturn($params)
    {
        // Handle payment return
        return $this->fetchTemplate('views/templates/hook/payment_return.tpl');
    }

    public function hookDisplayAdminOrder($params)
    {
        // Display crypto details in admin order view
        $orderId = $params['id_order'];
        $cryptoData = $this->getCryptoDataForOrder($orderId);

        $this->context->smarty->assign([
            'crypto_data' => $cryptoData,
            'order_id' => $orderId,
        ]);

        // For now, return simple HTML instead of template since template doesn't exist
        if (!empty($cryptoData)) {
            $html = '<div class="panel">';
            $html .= '<div class="panel-heading">';
            $html .= '<i class="icon-bitcoin"></i> Crypto Payment Details';
            $html .= '</div>';
            $html .= '<div class="table-responsive">';
            $html .= '<table class="table">';
            $html .= '<thead><tr><th>Asset</th><th>Address</th><th>Amount</th><th>Status</th></tr></thead>';
            $html .= '<tbody>';

            foreach ($cryptoData as $data) {
                $html .= '<tr>';
                $html .= '<td>' . htmlspecialchars($data['asset']) . '</td>';
                $html .= '<td>' . htmlspecialchars($data['address']) . '</td>';
                $html .= '<td>' . htmlspecialchars($data['amount']) . '</td>';
                $html .= '<td>' . htmlspecialchars($data['status']) . '</td>';
                $html .= '</tr>';
            }

            $html .= '</tbody></table>';
            $html .= '</div></div>';

            return $html;
        }

        return '';
    }

    public function hookDisplayHeader()
    {
        // Add frontend assets
        $this->context->controller->addJS($this->_path . 'views/js/crypto.js');
        $this->context->controller->addCSS($this->_path . 'views/css/crypto.css');
    }

    private function getCryptoDataForOrder($orderId)
    {
        $sql = 'SELECT * FROM ' . _DB_PREFIX_ . 'crypto_order_addr WHERE order_id = ' . (int)$orderId;
        return Db::getInstance()->executeS($sql);
    }

    public function getContent()
    {
        // Admin configuration form
        $output = '';

        if (Tools::isSubmit('submit' . $this->name)) {
            // Save configuration
            Configuration::updateValue('SDF_OURTOKEN_CONTRACT', Tools::getValue('SDF_OURTOKEN_CONTRACT'));
            Configuration::updateValue('SDF_OURTOKEN_DISCOUNT', Tools::getValue('SDF_OURTOKEN_DISCOUNT'));
            // ... save other configs

            $output .= $this->displayConfirmation($this->l('Settings updated'));
        }

        return $output . $this->renderForm();
    }

    private function renderForm()
    {
        $fields_form = [
            'form' => [
                'legend' => [
                    'title' => $this->l('Settings'),
                    'icon' => 'icon-cogs'
                ],
                'input' => [
                    [
                        'type' => 'text',
                        'label' => $this->l('OURTOKEN Contract Address'),
                        'name' => 'SDF_OURTOKEN_CONTRACT',
                        'required' => true
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('OURTOKEN Discount %'),
                        'name' => 'SDF_OURTOKEN_DISCOUNT',
                        'suffix' => '%'
                    ],
                    // Add more fields for USDC, RPC URLs, etc.
                ],
                'submit' => [
                    'title' => $this->l('Save'),
                ]
            ]
        ];

        $helper = new HelperForm();
        $helper->show_toolbar = false;
        $helper->table = $this->table;
        $helper->module = $this;
        $helper->default_form_language = $this->context->language->id;
        $helper->allow_employee_form_lang = Configuration::get('PS_BO_ALLOW_EMPLOYEE_FORM_LANG', 0);
        $helper->identifier = $this->identifier;
        $helper->submit_action = 'submit' . $this->name;
        $helper->currentIndex = $this->context->link->getAdminLink('AdminModules', false) . '&configure=' . $this->name . '&tab_module=' . $this->tab . '&module_name=' . $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');
        $helper->tpl_vars = [
            'fields_value' => [
                'SDF_OURTOKEN_CONTRACT' => Configuration::get('SDF_OURTOKEN_CONTRACT'),
                'SDF_OURTOKEN_DISCOUNT' => Configuration::get('SDF_OURTOKEN_DISCOUNT'),
            ],
            'languages' => $this->context->controller->getLanguages(),
            'id_language' => $this->context->language->id,
        ];

        return $helper->generateForm([$fields_form]);
    }
}