import os
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS # Necessário para permitir requisições do seu site

# --- Configuração da API do Gemini ---
API_KEY = "SUA_API_KEY_AQUI"
genai.configure(AIzaSyAWYcCfZ8P_vVlbLPSvpupsyLYT6GNF1Mg)

# Defina o modelo que você quer usar
MODELO_IA = "gemini-1.5-pro-latest" 

# Configuração do Flask
app = Flask(__name__)
CORS(app) # Habilita CORS para o seu frontend poder acessar

@app.route('/perguntar_ia', methods=['POST'])
def perguntar_ia():
    try:
        dados = request.get_json()
        pergunta_do_usuario = dados.get('pergunta', '')

        if not pergunta_do_usuario:
            return jsonify({"erro": "Nenhuma pergunta foi enviada."}), 400

        # --- Conexão e processamento com o Gemini ---
        model = genai.GenerativeModel(MODELO_IA)
        response = model.generate_content(pergunta_do_usuario)

        # Retorna a resposta da IA
        return jsonify({"resposta": response.text})

    except Exception as e:
        return jsonify({"erro": f"Ocorreu um erro no servidor: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
