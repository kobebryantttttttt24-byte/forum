#!/bin/bash
# 郭子论坛 - 启动脚本
# 编辑下方参数启用腾讯云短信
# 或直接用: node server.js

export SMS_PROVIDER=console
# export SMS_TENCENT_SECRET_ID=AKID...
# export SMS_TENCENT_SECRET_KEY=...
# export SMS_TENCENT_SDK_APP_ID=1400...
# export SMS_TENCENT_SIGN=郭子论坛
# export SMS_TENCENT_TEMPLATE_ID=1234567

cd "$(dirname "$0")"
exec /Applications/Codex.app/Contents/Resources/node server.js
