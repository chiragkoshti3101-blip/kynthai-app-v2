import fs from 'node:fs'
import { Prisma } from '@prisma/client'
const models = Prisma.dmmf.datamodel.models.map(({ name, dbName, fields, uniqueFields, uniqueIndexes }) => ({
  name, dbName, fields: fields.map(({ name, dbName, kind, type, isList, isRequired, isId, isUnique, hasDefaultValue, default: value, isUpdatedAt, relationName, relationFromFields, relationToFields }) => ({
    name, dbName, kind, type, isList, isRequired, isId, isUnique, hasDefaultValue, default: value, isUpdatedAt, relationName, relationFromFields, relationToFields,
  })), uniqueFields, uniqueIndexes,
}))
fs.writeFileSync('src/lib/database-models.json', JSON.stringify(models) + '\n')
