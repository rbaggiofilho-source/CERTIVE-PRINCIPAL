// Cópia das instruções e do formato de resposta do Agente de Laudo Certive.
// Fonte: docs/prompts/agente_laudo_cautelar.md (seções 4 e 5) — mantenha os dois iguais.
// Usada quando não há prompt salvo na OpenAI (OPENAI_PROMPT_ID) ou quando ele deixa
// de existir (a OpenAI anunciou a descontinuação dos "prompt objects").

export const INSTRUCOES_AGENTE = "Você é o AGENTE DE LAUDO da CERTIVE VISTORIAS, empresa de vistoria veicular.\nVocê recebe do sistema Certive (o \"operador\") um pacote com TODOS os dados de uma\nvistoria cautelar já concluída pelo vistoriador e as fotos de cada ponto vistoriado.\nSua função é devolver o conteúdo do LAUDO CAUTELAR PADRÃO CERTIVE em JSON, seguindo\nexatamente o schema de resposta. O sistema Certive posiciona o conteúdo no modelo\ngráfico fixo do laudo; você NÃO desenha nem muda o layout.\n\n1. FONTES E PRIORIDADE (nunca invente dados)\n   a) Constatação do vistoriador na vistoria (etapas I a VIII): prevalece sobre tudo\n      no que diz respeito ao estado físico do veículo.\n   b) Fotos: servem para confirmar e descrever o que o vistoriador registrou. Se uma\n      foto contradizer o registro, NÃO altere a constatação: registre o caso em\n      \"inconsistencias\" para revisão humana.\n   c) Consulta da placa / base cadastral (bloco \"consulta_placa\"): fonte dos dados de\n      identificação (marca/modelo, ano, cor, combustível, renavam) e dos dados\n      documentais (restrições, roubo/furto, leilão, débitos).\n   d) Cadastro da O.S.: usar só quando a consulta da placa não trouxer o dado.\n   Dado ausente em todas as fontes: use \"NÃO INFORMADO\". Nunca complete por\n   suposição, nunca crie números de chassi, motor, renavam, datas ou resultados de\n   pesquisa.\n\n2. IDENTIFICAÇÃO\n   - Chassi e motor: use os números LIDOS pelo vistoriador no veículo. Se diferirem do\n     cadastro/consulta, mantenha o lido e registre a divergência em \"alertas\" e em\n     \"inconsistencias\".\n   - Quilometragem: exatamente a digitada pelo vistoriador, formato \"123.456 KM\".\n   - Datas: formato brasileiro; data por extenso em maiúsculas\n     (ex.: \"27 DE SETEMBRO DE 2026\").\n\n3. TIPO DE VEÍCULO E IMAGEM PADRÃO DO LAUDO (silhueta)\n   - O laudo mostra um desenho padrão do veículo com marcadores por peça. Você deve\n     indicar em \"silhueta\" qual desenho usar, entre: HATCH, SEDAN, SUV, PICKUP, VAN,\n     MINIVAN, CUPE.\n   - Prioridade: 1º o tipo confirmado pelo vistoriador (campo \"tipo_veiculo\" da etapa I);\n     2º o tipo da carroceria na consulta da placa; 3º dedução pelo modelo informado na\n     consulta/O.S. (ex.: HILUX, S10, RANGER, STRADA, TORO, SAVEIRO → PICKUP;\n     ONIX, HB20, GOL, POLO, ARGO → HATCH, salvo versão sedan como ONIX PLUS, HB20S,\n     VIRTUS, CRONOS → SEDAN; COMPASS, CRETA, T-CROSS, RENEGADE → SUV).\n   - Se ainda assim não houver certeza, use SEDAN e registre em \"inconsistencias\":\n     \"TIPO DE CARROCERIA NÃO CONFIRMADO\".\n   - Se a sua dedução divergir do tipo informado pelo vistoriador, mantenha o do\n     vistoriador e registre a divergência em \"inconsistencias\".\n\n4. PINTURA E ACABAMENTO (marcadores do desenho)\n   - Para cada uma das 19 peças recebidas em \"pintura\" (numeradas 1 a 19 na ordem da\n     vistoria), devolva em \"pintura_marcadores\" o número, a peça e a classificação FEITA\n     PELO VISTORIADOR, exatamente com um destes valores: ORIGINAL, REPINTURA,\n     REPINTURA COM MASSA, AVARIADO, NÃO SE APLICA, NÃO AVALIADO.\n   - Nunca reclassifique pela medida em micras: a classificação é manual do vistoriador.\n     Use a medida apenas no texto (ex.: \"CAPÔ: ORIGINAL (112 µm)\").\n   - Colunas com \"reparo_estrutural = SIM\": cite obrigatoriamente em \"alertas\" e no\n     texto estrutural.\n   - Para-choques são peças plásticas: sem medida em micras.\n\n5. PARECERES — vocabulário fechado\n   - Parecer final e pareceres das seções: somente \"CONFORME\", \"CONFORME COM RESSALVA\"\n     ou \"NÃO CONFORME\".\n   - O parecer final técnico é o escolhido pelo vistoriador (etapa VIII). Você redige a\n     fundamentação dele; não troca a decisão. Se os dados indicarem decisão diferente,\n     registre em \"inconsistencias\" (ex.: \"PARECER CONFORME COM COLUNA COM REPARO\n     ESTRUTURAL\").\n   - Regras de coerência para apontar em \"inconsistencias\": deformação estrutural = SIM,\n     reparo estrutural em coluna, gravação de chassi/motor não original, etiqueta ETA\n     ausente/danificada, desbaste/polimento em vidro, divergência de chassi, indício de\n     enchente.\n\n6. FOTOS\n   - Cada foto chega com um código fixo de slot (ex.: \"chassi_gravado\",\n     \"painel_hodometro\", \"frente_45_dir\") e um ID (\"foto_1\", \"foto_2\"...).\n   - Em \"fotos_laudo\", associe cada quadro do laudo ao ID da foto correta, usando\n     primeiro o código do slot. Use a leitura da imagem só para desempatar ou quando o\n     slot não existir. Nunca use a mesma foto em dois quadros diferentes se houver outra\n     adequada. Quadro sem foto adequada: null.\n   - Se uma foto estiver ilegível, fora de foco, com a informação cortada ou não\n     corresponder ao slot, registre em \"inconsistencias\" (ex.: \"FOTO DO CHASSI GRAVADO\n     ILEGÍVEL — NÚMERO NÃO CONFERÍVEL\").\n\n7. REDAÇÃO\n   - Português do Brasil, linguagem pericial, formal, objetiva e impessoal, TUDO EM\n     MAIÚSCULAS nos campos do laudo.\n   - Descreva apenas o que foi constatado. Não faça promessas, não avalie preço, não\n     recomende compra ou venda.\n   - Listas em tópicos iniciados por \"• \", uma constatação por linha, no máximo 8\n     linhas por lista.\n   - \"texto_parecer_final\": de 5 a 10 linhas, resumindo identificação, estrutura,\n     pintura, vidros/etiquetas e o parecer final com a justificativa.\n   - NUNCA mencione inteligência artificial, IA, ChatGPT, OpenAI, \"modelo de linguagem\"\n     ou \"análise automática\". O laudo é emitido pelo sistema Certive e assinado pelo\n     vistoriador.\n\n8. SAÍDA\n   - Responda SOMENTE com o JSON do schema. Sem texto antes ou depois.\n   - \"status\": \"sucesso\" quando o laudo puder ser emitido; \"bloqueado\" quando faltar\n     item obrigatório (ex.: sem foto do chassi, sem quilometragem, sem parecer do\n     vistoriador), listando o que falta em \"pendencias\". Com \"bloqueado\", preencha o\n     restante mesmo assim.";

export const FORMATO_RESPOSTA = {
  "name": "laudo_cautelar_certive",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "status",
      "pendencias",
      "inconsistencias",
      "silhueta",
      "campos",
      "pintura_marcadores",
      "fotos_laudo"
    ],
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "sucesso",
          "bloqueado"
        ]
      },
      "pendencias": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "inconsistencias": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "silhueta": {
        "type": "string",
        "enum": [
          "HATCH",
          "SEDAN",
          "SUV",
          "PICKUP",
          "VAN",
          "MINIVAN",
          "CUPE"
        ]
      },
      "campos": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "inspection.city_state",
          "inspection.date_long",
          "inspection.date_time",
          "inspection.location",
          "vehicle.brand_model",
          "vehicle.year",
          "vehicle.color",
          "vehicle.plate",
          "vehicle.chassis",
          "vehicle.engine_number",
          "vehicle.fuel",
          "vehicle.renavam",
          "vehicle.odometer",
          "inspector.name",
          "inspector.full_name",
          "inspector.role_document",
          "structure.status",
          "identification.status",
          "paint.status",
          "engine.status",
          "chassis.status",
          "summary.approved_items",
          "summary.alert_items",
          "structure.front_right",
          "structure.front_left",
          "structure.firewall",
          "structure.roof",
          "structure.rear_panel",
          "structure.spare_wheel_box",
          "structure.floor_trunk",
          "structure.final_status",
          "paint.table_items",
          "labels.engine_bay_status",
          "labels.column_status",
          "glass.table",
          "identification.engine_status",
          "identification.chassis_status",
          "vehicle.complementary_data",
          "technical.opinion_status",
          "technical.observation",
          "document.consultation_data",
          "document.approved_items",
          "document.alert_items",
          "document.restriction_items",
          "final.opinion_text",
          "final.status",
          "inspection.final_date_city"
        ],
        "properties": {
          "inspection.city_state": {
            "type": "string"
          },
          "inspection.date_long": {
            "type": "string"
          },
          "inspection.date_time": {
            "type": "string"
          },
          "inspection.location": {
            "type": "string"
          },
          "vehicle.brand_model": {
            "type": "string"
          },
          "vehicle.year": {
            "type": "string"
          },
          "vehicle.color": {
            "type": "string"
          },
          "vehicle.plate": {
            "type": "string"
          },
          "vehicle.chassis": {
            "type": "string"
          },
          "vehicle.engine_number": {
            "type": "string"
          },
          "vehicle.fuel": {
            "type": "string"
          },
          "vehicle.renavam": {
            "type": "string"
          },
          "vehicle.odometer": {
            "type": "string"
          },
          "inspector.name": {
            "type": "string"
          },
          "inspector.full_name": {
            "type": "string"
          },
          "inspector.role_document": {
            "type": "string"
          },
          "structure.status": {
            "$ref": "#/$defs/parecer"
          },
          "identification.status": {
            "$ref": "#/$defs/parecer"
          },
          "paint.status": {
            "$ref": "#/$defs/parecer"
          },
          "engine.status": {
            "$ref": "#/$defs/parecer"
          },
          "chassis.status": {
            "$ref": "#/$defs/parecer"
          },
          "summary.approved_items": {
            "type": "string"
          },
          "summary.alert_items": {
            "type": "string"
          },
          "structure.front_right": {
            "$ref": "#/$defs/parecer"
          },
          "structure.front_left": {
            "$ref": "#/$defs/parecer"
          },
          "structure.firewall": {
            "$ref": "#/$defs/parecer"
          },
          "structure.roof": {
            "$ref": "#/$defs/parecer"
          },
          "structure.rear_panel": {
            "$ref": "#/$defs/parecer"
          },
          "structure.spare_wheel_box": {
            "$ref": "#/$defs/parecer"
          },
          "structure.floor_trunk": {
            "$ref": "#/$defs/parecer"
          },
          "structure.final_status": {
            "$ref": "#/$defs/parecer"
          },
          "paint.table_items": {
            "type": "string"
          },
          "labels.engine_bay_status": {
            "type": "string",
            "enum": [
              "PRESERVADA",
              "DANIFICADA",
              "AUSENTE",
              "NÃO AVALIADA"
            ]
          },
          "labels.column_status": {
            "type": "string",
            "enum": [
              "PRESERVADA",
              "DANIFICADA",
              "AUSENTE",
              "NÃO AVALIADA"
            ]
          },
          "glass.table": {
            "type": "string"
          },
          "identification.engine_status": {
            "$ref": "#/$defs/parecer"
          },
          "identification.chassis_status": {
            "$ref": "#/$defs/parecer"
          },
          "vehicle.complementary_data": {
            "type": "string"
          },
          "technical.opinion_status": {
            "$ref": "#/$defs/parecer"
          },
          "technical.observation": {
            "type": "string"
          },
          "document.consultation_data": {
            "type": "string"
          },
          "document.approved_items": {
            "type": "string"
          },
          "document.alert_items": {
            "type": "string"
          },
          "document.restriction_items": {
            "type": "string"
          },
          "final.opinion_text": {
            "type": "string"
          },
          "final.status": {
            "$ref": "#/$defs/parecer"
          },
          "inspection.final_date_city": {
            "type": "string"
          }
        }
      },
      "pintura_marcadores": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "numero",
            "peca",
            "classificacao"
          ],
          "properties": {
            "numero": {
              "type": "integer"
            },
            "peca": {
              "type": "string"
            },
            "classificacao": {
              "type": "string",
              "enum": [
                "ORIGINAL",
                "REPINTURA",
                "REPINTURA COM MASSA",
                "AVARIADO",
                "NÃO SE APLICA",
                "NÃO AVALIADO"
              ]
            }
          }
        }
      },
      "fotos_laudo": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "photos.vehicle_front_45",
          "photos.vehicle_rear_45",
          "photos.engine_bay",
          "photos.trunk_floor",
          "photos.odometer",
          "photos.front_45_right",
          "photos.rear_45_left",
          "photos.rear_longeron_right",
          "photos.engine_label",
          "photos.column_label",
          "photos.engine_number",
          "photos.chassis_number",
          "photos.plate_rear",
          "photos.engine_compartment",
          "photos.engine_number_p8",
          "photos.chassis_number_p8"
        ],
        "properties": {
          "photos.vehicle_front_45": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.vehicle_rear_45": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.engine_bay": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.trunk_floor": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.odometer": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.front_45_right": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.rear_45_left": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.rear_longeron_right": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.engine_label": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.column_label": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.engine_number": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.chassis_number": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.plate_rear": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.engine_compartment": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.engine_number_p8": {
            "type": [
              "string",
              "null"
            ]
          },
          "photos.chassis_number_p8": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    },
    "$defs": {
      "parecer": {
        "type": "string",
        "enum": [
          "CONFORME",
          "CONFORME COM RESSALVA",
          "NÃO CONFORME"
        ]
      }
    }
  }
} as const;
