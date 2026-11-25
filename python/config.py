"""Shared connection settings. Override with environment variables."""
import os
from pymongo import MongoClient, WriteConcern, ReadPreference
from pymongo.read_concern import ReadConcern

MONGO_URI = os.getenv("MONGO_URI",
    "mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0")
DB_NAME = os.getenv("DB_NAME", "utility_billing")

_client = None

def get_client():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, retryWrites=True, w="majority",
                              serverSelectionTimeoutMS=8000)
    return _client

def get_db():
    return get_client()[DB_NAME]

TXN_OPTS = dict(read_concern=ReadConcern("snapshot"),
                write_concern=WriteConcern("majority"),
                read_preference=ReadPreference.PRIMARY)
