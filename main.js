//load the libraries
const express = require('express')
const handlebars = require('express-handlebars')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const mysql = require('mysql2/promise')

const API_KEY = process.env.API_KEY || ""
const BASE_URL = 'https://api.nytimes.com/svc/books/v3/lists.json'

//configure the PORT
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

// SQL
const SQL_BOOK_LIST = 'select book_id, title from book2018 where title like ? order by title asc limit 10 offset ?'
const SQL_COUNT_RESULTS = 'select count(*) as t from book2018 where title like ?'
const SQL_BOOK_DETAILS = 'select * from book2018 where book_id = ?'

const mkQuery = (sqlStmt, pool) => {
	const f = async (params) => {
		// get a connection from the pool
		const conn = await pool.getConnection()

		try {
			// Execute the query with the parameter
			const results = await pool.query(sqlStmt, params)
			return results[0]
		} catch(e) {
			return Promise.reject(e)
		} finally {
			conn.release()
		}
	}
	return f
}

/*const startApp = async (app, pool) => {
	const conn = await pool.getConnection()
	try {
		console.info('Pinging database...')
		await conn.ping()
		app.listen(PORT, () => {
			console.info(`Application started on port ${PORT} at ${new Date()}`)
		})
	} catch(e) {
		console.error('Cannot ping database', e)
	} finally {
		conn.release()
	}
}*/

//create connection pool
const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT) || 3306,
	database: 'goodreads',
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	connectionLimit: 4
})

//create queries
const getTitles = mkQuery(SQL_BOOK_LIST, pool)
const getTotal = mkQuery(SQL_COUNT_RESULTS, pool)
const getDetails = mkQuery(SQL_BOOK_DETAILS, pool)

//create an instance of express
const app = express()

//configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

//configure app
app.get('/', (req, resp) => {
    resp.status(200)
    resp.type('text/html')
    resp.render('index')
})

app.get('/list', async (req, resp) => {

  const q = req.query['q']
  let qStr = q+"%"
  let offset = parseInt(req.query['offset']) || 0

  console.info(offset)
  try {
    const result = await getTitles([ qStr, offset ])
    const total = await getTotal([ qStr ])
    
    const totalReturns = total[0].t
    
		resp.status(200)
		resp.type('text/html')
		resp.render('list', { 
      q, 
      books: result, 
      hasResults: result.length>0,
      hasLess: offset,
      hasMore: (offset+10)<totalReturns,
      prevOffset: Math.max(0, offset - 10),
      nextOffset: offset+10,
    })
	} catch(e) {
		console.error('ERROR: ', e)
		resp.status(500)
		resp.end()
	}
})

app.get('/details/:book_id', async (req, resp) => {

  const bookId = req.params.book_id
  
 
  try {
    const details = await getDetails([ bookId ])
    let d = details[0]
    //replace all | to , in genres and authors
    d.genres = d.genres.replaceAll('|',', ') 
    d.authors = d.authors.replaceAll('|',', ')
    
  	resp.status(200)
		resp.type('text/html')
		resp.render('details', { details:d })
	} catch(e) {
		console.error('ERROR: ', e)
		resp.status(500)
		resp.end()
	}
})

app.get('/reviews', 
  async (req, resp) => {
    const title = req.query['title']
    const author = req.query['author']
    
    console.info('title: ', title)
    console.info('author: ', author)

    //construct the url with the query parameters
    const url = withQuery(BASE_URL, {
        api-key: API_KEY,
        title: title,
        author: author
    })

    let result = await fetch(url)
    result = await result.json()

    /*const mChar = result.data.results
    .map( d => {
            return { id: d.id, name: d.name }
        }
    )
    //const mChar = result.data.results

  console.info(mChar)*/
  resp.status(200)
  resp.type('text/html')
  resp.render('reviews', { })
})

//start the server
app.listen(PORT, () => {
    console.info(`Application started on port ${PORT} at ${new Date()}`)
  }
)