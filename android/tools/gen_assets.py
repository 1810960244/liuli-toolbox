#!/usr/bin/env python3
# 生成 Android 资源图标 + APK 签名密钥库（PKCS12，无需 Java）
import os, datetime, sys
from PIL import Image
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12

BASE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RES = os.path.join(BASE, 'res')
ICON = os.path.normpath(os.path.join(BASE, '..', 'icons', 'icon-512.png'))

# 1) mipmap 图标
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
src = Image.open(ICON).convert('RGBA')
for d, s in sizes.items():
    outdir = os.path.join(RES, 'mipmap-' + d)
    os.makedirs(outdir, exist_ok=True)
    src.resize((s, s), Image.LANCZOS).save(os.path.join(outdir, 'ic_launcher.png'))
print('icons ok:', ', '.join('%s=%dpx' % (d, s) for d, s in sizes.items()))

# 2) keystore.p12
# 口令不再硬编码：这个脚本以前会把密钥和口令一起生成到仓库里，
# 结果两样都进了 git 历史。现在只从环境变量读，没给就跳过生成。
PASS = os.environ.get('KS_PASS', '')
out = os.path.join(BASE, 'keystore.p12')
if not PASS:
    print('未设置 KS_PASS，跳过密钥库生成（密钥不进仓库）')
elif os.path.exists(out):
    print('keystore 已存在，跳过（如需重置请手动删除）')
else:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, 'Toolbox'),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Toolbox'),
        x509.NameAttribute(NameOID.COUNTRY_NAME, 'CN'),
    ])
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow() - datetime.timedelta(days=1))
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
            .sign(key, hashes.SHA256()))
    data = pkcs12.serialize_key_and_certificates(
        name=b'toolbox', key=key, cert=cert, cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(PASS.encode()))
    with open(out, 'wb') as f:
        f.write(data)
    print('keystore ok: %s (%d bytes)  alias=toolbox' % (out, len(data)))
